/**
 * Read and decode `.t3work-runs/<run-id>/journal.jsonl` into the maps the engine replays
 * against: a `seq → JournalEntry` map (the call/sent entries) and a
 * `correlationId → ResolvedEntry` map (the Handle-pattern replies).
 *
 * ── File shape ──────────────────────────────────────────────────────────────
 * One JSON object per line, in append order:
 *
 *   { seq, callId, kind, refId, argsHash, result?, phase?, correlationId?, startedAt, endedAt }
 *
 * `phase` (25.4) splits a Handle primitive's lifecycle into two lines:
 *   • `phase: "sent"`    — the side effect fired (ui.show / thread.send / child.spawn /
 *     user.ask / user.notify). Carries a `correlationId`, NO `result`. Keyed by `seq`.
 *   • `phase: "resolved"`— the reply for that `correlationId` settled (or was dismissed).
 *     Carries the `result`. Keyed by `correlationId`, NOT by `seq` — it arrives out of band
 *     (possibly hours later, via the broker), so it does not occupy a replay position.
 * A line with no `phase` is a normal `"call"` entry (25.2/25.3) — unchanged.
 *
 * The `result` field is a *result envelope*: `{ "v": <value> }` for a normal return,
 * `{ "void": true }` for a void handler/empty reply, or `{ "dismissed": true }` for a
 * dismissed Handle. Absent for `"script-never"` markers and `"sent"` entries.
 *
 * ── Torn-tail recovery ──────────────────────────────────────────────────────
 * A single *torn final line* — the final line fails to parse AND the file does not end
 * in `\n` — is dropped with a warning (a crash mid-append is recoverable). Mid-file
 * corruption still fails loud.
 */

import { createRequire } from "node:module";

import * as Schema from "effect/Schema";

import type { PrimitiveKind } from "./t3work-sdk.types.ts";

const nodeRequire = createRequire(import.meta.url);
interface NodeFsModule {
  readonly existsSync: (path: string) => boolean;
  readonly readFileSync: (path: string, encoding: "utf8") => string;
}
const fs = nodeRequire("node:fs") as NodeFsModule;

/** The recorded return value, replayed verbatim instead of re-executing. */
const ResultEnvelopeSchema = Schema.Union([
  Schema.Struct({ v: Schema.Unknown }),
  Schema.Struct({ void: Schema.Literal(true) }),
  Schema.Struct({ dismissed: Schema.Literal(true) }),
]);

export const JournalEntrySchema = Schema.Struct({
  /** Monotonic per-run counter; the position this call occupies in the body's call order. */
  seq: Schema.Number,
  /** `"<seq>:<kind>:<refId>"` — stable identity of the call site for this run. */
  callId: Schema.String,
  kind: Schema.Literals([
    "tool",
    "script",
    "script-never",
    "now",
    "random",
    "uuid",
    "wait",
    "agent",
    "agent.task",
    "parallel",
    "pipeline",
    "thread.send",
    "child.spawn",
    "user.ask",
    "user.notify",
    "ui.show",
    "workflow",
  ]),
  /** Tool id (e.g. `github.pull_request.merge`) or script/primitive registration name. */
  refId: Schema.String,
  /** SHA-256 (hex) of canonical-JSON args. Compared on replay to detect drift. */
  argsHash: Schema.String,
  /** Result envelope; absent for `script-never` markers and `sent` entries. */
  result: Schema.optional(ResultEnvelopeSchema),
  /** `"sent"`/`"resolved"` for Handle-pattern lines; absent for normal calls (25.4). */
  phase: Schema.optional(Schema.Literals(["sent", "resolved"])),
  /** The Handle's stable id (`"<runId>:<seq>"`); present on `sent`/`resolved` lines. */
  correlationId: Schema.optional(Schema.String),
  startedAt: Schema.String,
  endedAt: Schema.String,
});

export interface JournalEntry {
  readonly seq: number;
  readonly callId: string;
  // Widest the journal `kind` can be (the {@link PrimitiveKind} union). The read-side
  // `Schema.Literals` validates the full set the writer can emit.
  readonly kind: PrimitiveKind;
  readonly refId: string;
  readonly argsHash: string;
  /**
   * The *unwrapped* recorded value (the envelope is an on-disk detail). `undefined` for a
   * void handler result, a `script-never` marker, or a `sent` entry — disambiguate via
   * `kind`/`phase`.
   */
  readonly result: unknown;
  /** `"sent"` for a fired-but-unresolved Handle; absent for normal calls. */
  readonly phase?: "sent";
  /** Handle correlation id, present on `sent` entries. */
  readonly correlationId?: string;
  readonly startedAt: string;
  readonly endedAt: string;
}

/** A settled Handle reply, keyed by `correlationId` (it arrives out of band, not by `seq`). */
export interface ResolvedEntry {
  readonly correlationId: string;
  readonly kind: PrimitiveKind;
  readonly refId: string;
  /** `true` when the handle was dismissed — `.response` must reject, a late reply ignored. */
  readonly dismissed: boolean;
  /** The validated reply value (the `{ v }` envelope, unwrapped). `undefined` if void. */
  readonly reply: unknown;
}

export interface JournalMaps {
  readonly bySeq: Map<number, JournalEntry>;
  readonly byCorrelation: Map<string, ResolvedEntry>;
}

// Hoisted: keep the compiled decoder at module scope (see no-inline-schema-compile).
const decodeJournalEntry = Schema.decodeUnknownSync(JournalEntrySchema);

type Wire = typeof JournalEntrySchema.Type;

function unwrapResult(envelope: Wire["result"]): unknown {
  if (envelope === undefined || "void" in envelope || "dismissed" in envelope) return undefined;
  return envelope.v;
}

/**
 * Read and validate every entry in a journal file, splitting it into the `seq`-keyed
 * call/sent map and the `correlationId`-keyed resolved map. A missing file yields empty
 * maps. A single torn final line is dropped with a warning; any other malformed line throws.
 */
export function readJournalEntries(
  journalPath: string,
  onWarn: (message: string) => void = () => {},
): JournalMaps {
  const bySeq = new Map<number, JournalEntry>();
  const byCorrelation = new Map<string, ResolvedEntry>();
  if (!fs.existsSync(journalPath)) return { bySeq, byCorrelation };

  const text = fs.readFileSync(journalPath, "utf8");
  const endsWithNewline = text.endsWith("\n");
  const lines = text.split("\n");
  let lastContentIndex = -1;
  for (const [index, rawLine] of lines.entries()) {
    if (rawLine.trim().length > 0) lastContentIndex = index;
  }

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    try {
      const wire = decodeJournalEntry(JSON.parse(line));
      if (wire.phase === "resolved") {
        // First write wins: a dismissal already recorded here makes a late reply a no-op.
        if (wire.correlationId !== undefined && !byCorrelation.has(wire.correlationId)) {
          byCorrelation.set(wire.correlationId, {
            correlationId: wire.correlationId,
            kind: wire.kind,
            refId: wire.refId,
            dismissed: wire.result !== undefined && "dismissed" in wire.result,
            reply: unwrapResult(wire.result),
          });
        }
        continue;
      }
      bySeq.set(wire.seq, {
        seq: wire.seq,
        callId: wire.callId,
        kind: wire.kind,
        refId: wire.refId,
        argsHash: wire.argsHash,
        result: unwrapResult(wire.result),
        ...(wire.phase === "sent" ? { phase: "sent" as const } : {}),
        ...(wire.correlationId === undefined ? {} : { correlationId: wire.correlationId }),
        startedAt: wire.startedAt,
        endedAt: wire.endedAt,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (index === lastContentIndex && !endsWithNewline) {
        onWarn(
          `Dropping a torn final line in '${journalPath}' (line ${index + 1}): ${reason}. A crash likely interrupted the last append; the run resumes from the prior durable entry.`,
        );
        continue;
      }
      throw new Error(`Corrupt journal entry at ${journalPath}:${index + 1}: ${reason}`, {
        cause: error,
      });
    }
  }
  return { bySeq, byCorrelation };
}

/** The `seq → JournalEntry` map alone (call/sent entries). Resolved replies are excluded. */
export function readJournal(
  journalPath: string,
  onWarn: (message: string) => void = () => {},
): ReadonlyMap<number, JournalEntry> {
  return readJournalEntries(journalPath, onWarn).bySeq;
}
