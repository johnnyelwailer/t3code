/**
 * Bounded execution — the `checkpoint` primitive and the checkpoint-aware replay window.
 *
 * A checkpoint is a durable `(seq, compactState)` boundary: it records the state sufficient to
 * continue a run and establishes the earliest sequence a replay reader still has to materialize.
 * Resume restores the compact state and re-drives the body from the boundary instead of from
 * sequence zero, so the materialized working set is `O(checkpoint suffix + pending work)`, not
 * `O(completed iterations)`.
 *
 * Design invariants (docs/runbook/bounded-execution.md):
 *
 * - exactly three things: a durable journal-entry shape, a replay rule, and a retention policy;
 * - time comes from the journaled/host clock, never the live clock, inside a replayed body;
 * - fixed call identity (`kind`/`refId`) so the input participates in the ordinary canonical
 *   `argsHash` replay check — a checkpoint can never hide replay drift;
 * - append-only commit: the boundary is one journaled line; readers select the latest VALID
 *   checkpoint and replay only its suffix. Physical pruning is a backend capability, not part of
 *   checkpoint correctness.
 */

import { WorkflowError } from "./errors.ts";
import type { JournalEntry, JournalMaps } from "./journalReader.ts";

/** The journal kind a checkpoint occupies on the existing `PrimitiveCall` surface. */
export const CHECKPOINT_KIND = "checkpoint";
/** The fixed ref identity — same stable built-in style as `usage` and `wait.until`. */
export const CHECKPOINT_REF_ID = "checkpoint";

/** The bounded-history / superseded-detail vocabulary for a checkpoint. */
export interface CheckpointRetention {
  /** Detailed outputs kept in the materialized history view. */
  readonly history?: number;
  /** Superseded detail is kept in durable archive or may be pruned after commit. */
  readonly superseded?: "archive" | "prune";
}

export interface CheckpointInput<State> {
  /** Canonical-JSON state sufficient to continue from this boundary. */
  readonly state: State;
  readonly retention?: CheckpointRetention;
}

export interface CheckpointRecord<State = unknown> {
  /**
   * Highest EARLIER seq made unnecessary for active replay (the checkpoint's own boundary seq
   * is one higher). The retained suffix for a replay reader is the entries strictly AFTER the
   * checkpoint entry; the compact state below is what replaces everything at and before it.
   */
  readonly compactedThroughSeq: number;
  readonly state: State;
  readonly retainedHistory: number;
  readonly at: string;
}

export interface CheckpointPrimitives {
  readonly checkpoint: <State>(input: CheckpointInput<State>) => Promise<CheckpointRecord<State>>;
}

export interface CheckpointPrimitivesDeps {
  /**
   * The durable runtime's journaling primitive. A checkpoint only ever journals a call of its own
   * kind, so the dep accepts the checkpoint-shaped call — that keeps BOTH the open core contract
   * (`kind: string`) and the SDK's narrowed literal kind surface assignable to this port.
   */
  readonly callPrimitive: <R>(call: {
    readonly kind: typeof CHECKPOINT_KIND;
    readonly refId: string;
    readonly args: unknown;
    readonly exec: () => Promise<R>;
  }) => Promise<R>;
  /** Existing DurablePrimitiveRuntime cursor; read inside exec AFTER seq allocation. */
  readonly currentSeq: () => number;
  readonly nowIso: () => string;
}

/** Normalize + validate the optional retention before anything is journaled. */
export function normalizeCheckpointRetention(retention: CheckpointRetention | undefined): {
  readonly history: number;
  readonly superseded: "archive" | "prune";
} {
  const history = retention?.history ?? 0;
  if (!Number.isInteger(history) || history < 0) {
    throw new WorkflowError(
      `checkpoint: retention.history must be a non-negative integer (got ${String(history)}).`,
    );
  }
  const superseded = retention?.superseded ?? "archive";
  if (superseded !== "archive" && superseded !== "prune") {
    throw new WorkflowError(
      `checkpoint: retention.superseded must be "archive" or "prune" (got ${JSON.stringify(superseded)}).`,
    );
  }
  return { history, superseded };
}

export function createCheckpointPrimitives(deps: CheckpointPrimitivesDeps): CheckpointPrimitives {
  return {
    checkpoint: async <State>(input: CheckpointInput<State>): Promise<CheckpointRecord<State>> => {
      const retention = normalizeCheckpointRetention(input.retention);
      return deps.callPrimitive<CheckpointRecord<State>>({
        kind: CHECKPOINT_KIND,
        refId: CHECKPOINT_REF_ID,
        // The full input is the journaled arg surface: state changes between the original run and
        // a re-drive are caught by the ordinary argsHash drift check, exactly like any other call.
        args: { state: input.state, retention },
        exec: async () => {
          // `currentSeq()` is the checkpoint's own allocated boundary; the prefix it supersedes
          // is everything BEFORE it. The reader materializes strictly AFTER the boundary entry,
          // because the boundary entry itself is what the compact state replaces.
          const boundary = deps.currentSeq();
          return {
            compactedThroughSeq: boundary - 1,
            state: input.state,
            retainedHistory: retention.history,
            at: deps.nowIso(),
          };
        },
      });
    },
  };
}

/** The active boundary the replay reader selected, plus the compact state it carries. */
export interface ReplayWindowCheckpoint {
  /** The boundary entry's seq: resume re-drives the body with the seq counter starting HERE, so
   * the retained suffix replays at its original positions and no renumbered journal is needed. */
  readonly seq: number;
  readonly record: CheckpointRecord;
}

/**
 * A checkpoint-aware replay window: the latest valid checkpoint, the BOUNDED journal maps a
 * resume has to materialize (the suffix strictly after the boundary, with the bySeq entries at
 * their ORIGINAL seqs), the lifetime totals, and the suspended-handle diagnostic.
 *
 * `byCorrelation` always carries the full correlation map: settled `correlationId` deduplication
 * evidence and every unresolved reply must survive compaction (at-least-once delivery).
 */
export interface ReplayWindow {
  readonly checkpoint: ReplayWindowCheckpoint | undefined;
  /** The maps a resumed run replays against: `bySeq` = suffix after the boundary (or the full
   * map when no valid checkpoint exists), `byCorrelation` = the complete correlation map. */
  readonly entries: JournalMaps;
  /** Logical lifetime entry count (seq-keyed) — what the journal holds, not what was loaded. */
  readonly totalEntries: number;
  /** Entries materialized into {@link ReplayWindow.entries.bySeq} — the bounded working set. */
  readonly materializedEntries: number;
  /**
   * Correlations of RESOLVABLE `sent` entries (thread.turn / user.input / model.resolve /
   * wait.until) in the superseded prefix that have no recorded reply yet. A checkpoint past an
   * unsettled ask means the body checkpointed work that was not complete: the host should treat
   * this window as unsafe rather than resume into it. One-way verbs (thread.create /
   * thread.message) never settle and are excluded on purpose.
   */
  readonly unresolvedPrefixCorrelationIds: readonly string[];
}

/** Kinds whose `sent` entry must eventually carry a `resolved` reply. */
const RESOLVABLE_SENT_KINDS: ReadonlySet<string> = new Set([
  "thread.turn",
  "user.input",
  "model.resolve",
  "wait.until",
]);

/** True when a journaled result decodes as a structurally valid `CheckpointRecord`. */
export function isCheckpointRecord(result: unknown): result is CheckpointRecord {
  if (typeof result !== "object" || result === null) return false;
  const record = result as Record<string, unknown>;
  if (
    typeof record.compactedThroughSeq !== "number" ||
    !Number.isInteger(record.compactedThroughSeq)
  )
    return false;
  if (record.compactedThroughSeq < 0) return false;
  if (typeof record.retainedHistory !== "number" || !Number.isInteger(record.retainedHistory))
    return false;
  if (record.retainedHistory < 0) return false;
  if (typeof record.at !== "string") return false;
  if (!("state" in record)) return false;
  return true;
}

/**
 * Select the replay window from a run's full journal maps (append order irrelevant; `bySeq`
 * carries the truth). Pure and host-neutral: every `JournalStore` backend — filesystem or
 * database — can build its window by reading its rows into maps and calling this.
 *
 * Rule: the latest VALID checkpoint (by seq) is the active boundary; its retained suffix is every
 * seq-keyed entry strictly after it. No valid checkpoint → the whole journal is the window (a
 * pre-checkpoint run remains a full-replay run — no retroactive magic).
 */
export function selectReplayWindow(maps: JournalMaps): ReplayWindow {
  let boundary: { readonly seq: number; readonly record: CheckpointRecord } | undefined;
  for (const entry of maps.bySeq.values()) {
    if (entry.kind !== CHECKPOINT_KIND || entry.refId !== CHECKPOINT_REF_ID) continue;
    if (!isCheckpointRecord(entry.result)) continue;
    if (boundary === undefined || entry.seq > boundary.seq) {
      boundary = { seq: entry.seq, record: entry.result };
    }
  }

  const suffix = new Map<number, JournalEntry>();
  const unresolvedPrefix: string[] = [];
  if (boundary === undefined) {
    for (const [seq, entry] of maps.bySeq) suffix.set(seq, entry);
  } else {
    for (const [seq, entry] of maps.bySeq) {
      if (seq > boundary.seq) {
        suffix.set(seq, entry);
      } else if (
        seq < boundary.seq &&
        entry.phase === "sent" &&
        entry.correlationId !== undefined &&
        RESOLVABLE_SENT_KINDS.has(entry.kind) &&
        !maps.byCorrelation.has(entry.correlationId)
      ) {
        unresolvedPrefix.push(entry.correlationId);
      }
    }
  }

  return {
    checkpoint: boundary,
    entries: { bySeq: suffix, byCorrelation: maps.byCorrelation },
    totalEntries: maps.bySeq.size,
    materializedEntries: suffix.size,
    unresolvedPrefixCorrelationIds: unresolvedPrefix,
  };
}
