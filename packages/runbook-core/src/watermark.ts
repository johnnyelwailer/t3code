/**
 * Bounded execution — the `watermark` primitive: a durable cursor over a data source.
 *
 * A watermark is an offset, timestamp, revision, or high-water mark. `advance(next)` commits it;
 * a resume restores it, so the body reads strictly AFTER the durable cursor instead of rescanning
 * input it already processed. It is not a second trigger system: source registration, delivery,
 * and catch-up stay with the signal-source model; this module only keeps the cursor durable.
 *
 * The three bounded-execution things (docs/runbook/bounded-execution.md):
 *
 * - journal shape: an ordinary `checkpoint` entry whose `state` is a {@link WatermarkState}
 *   envelope — source identity, cursor, observation time. No new primitive kind;
 * - replay rule: a resume whose restored state is a watermark envelope seeds every source's cursor
 *   from it; the body continues strictly after that cursor;
 * - retention: each advance replaces the source's prior cursor; the superseded cursors are kept as
 *   a diagnostics ring bounded by the checkpoint's own `retention.history` (default 0).
 *
 * Invariants:
 *
 * - host-neutral: the only ports are the run's `checkpoint` primitive, the restored checkpoint
 *   record, and the journaled clock. A host adds its capability policy through `isAllowed`/`denied`;
 * - observation time comes from the journaled clock, so a re-driven body builds the identical
 *   envelope and the checkpoint's argsHash check still catches real drift;
 * - one boundary owner per run: a raw `checkpoint()` and `watermark()` would overwrite each
 *   other's restored state, so the first of the two fixes the owner ({@link WatermarkScopeError}).
 */

import {
  normalizeCheckpointRetention,
  type CheckpointPrimitives,
  type CheckpointRecord,
  type CheckpointRetention,
} from "./checkpoint.ts";
import { canonicalJsonError } from "./canonicalJson.ts";
import { WatermarkScopeError, WorkflowError } from "./errors.ts";

/** Envelope version; a restored envelope with another version is not this primitive's state. */
export const WATERMARK_ENVELOPE_VERSION = 1;

/** One durable cursor and the journaled time it was observed at (epoch ms). */
export interface WatermarkPoint<Cursor = unknown> {
  readonly cursor: Cursor;
  readonly observedAt: number;
}

/** A source's current cursor plus its superseded cursors, oldest first, bounded by retention. */
export interface WatermarkSourceState<Cursor = unknown> extends WatermarkPoint<Cursor> {
  readonly diagnostics: ReadonlyArray<WatermarkPoint<Cursor>>;
}

/**
 * The checkpoint `state` a watermark advance commits. The top-level `source`/`cursor`/`observedAt`
 * are the advance that committed this boundary; `sources` carries every source's durable cursor,
 * because a resume restores only the latest boundary and must not lose the other sources.
 */
export interface WatermarkState<Cursor = unknown> extends WatermarkPoint<Cursor> {
  readonly v: typeof WATERMARK_ENVELOPE_VERSION;
  readonly primitive: "watermark";
  readonly source: string;
  readonly sources: Readonly<Record<string, WatermarkSourceState<Cursor>>>;
}

export interface WatermarkOptions<Cursor> {
  /** The cursor `current()` reports before the first durable advance. */
  readonly initial?: Cursor;
  /**
   * Passed to the underlying checkpoint; `history` also sizes THIS source's diagnostics ring.
   * All sources share one boundary, so its retention metadata is that of the source that
   * advanced last.
   */
  readonly retention?: CheckpointRetention;
}

export interface Watermark<Cursor> {
  /** The durable cursor (restored on resume), else `initial`, else `undefined`. */
  readonly current: () => Cursor | undefined;
  /** Commit `next` as this source's durable cursor — one checkpoint boundary. */
  readonly advance: (next: Cursor) => Promise<void>;
}

export interface WatermarkPrimitives {
  readonly watermark: <Cursor>(
    sourceKey: string,
    opts?: WatermarkOptions<Cursor>,
  ) => Watermark<Cursor>;
  /** The run's `checkpoint`, refusing once the watermark owns the boundary. Bind THIS one. */
  readonly checkpoint: CheckpointPrimitives["checkpoint"];
}

export interface WatermarkPrimitivesDeps {
  /**
   * The run's checkpoint primitive. It must take its journal seq synchronously when called
   * (before its first `await`), as `createCheckpointPrimitives` does — an adapter that defers
   * the call would let later journaled calls take earlier seqs.
   */
  readonly checkpoint: CheckpointPrimitives["checkpoint"];
  /** The checkpoint record a checkpoint-window resume restored (absent on a fresh start). */
  readonly resume: CheckpointRecord | undefined;
  /** The journaled clock (epoch ms) — never the live clock. */
  readonly now: () => number;
  readonly isAllowed?: (sourceKey: string) => boolean;
  readonly denied?: (sourceKey: string) => Error;
}

/** True when a restored checkpoint state is a watermark envelope of this version. */
export function isWatermarkState(state: unknown): state is WatermarkState {
  if (typeof state !== "object" || state === null) return false;
  const envelope = state as Record<string, unknown>;
  return (
    envelope.v === WATERMARK_ENVELOPE_VERSION &&
    envelope.primitive === "watermark" &&
    typeof envelope.source === "string" &&
    typeof envelope.sources === "object" &&
    envelope.sources !== null
  );
}

/** Own-property lookup: a key such as `__proto__` must never read an inherited value. */
function sourceState(
  sources: Readonly<Record<string, WatermarkSourceState>>,
  sourceKey: string,
): WatermarkSourceState | undefined {
  return Object.hasOwn(sources, sourceKey) ? sources[sourceKey] : undefined;
}

export function createWatermarkPrimitives(deps: WatermarkPrimitivesDeps): WatermarkPrimitives {
  const restored = deps.resume?.state;
  let owner: "watermark" | "checkpoint" | undefined =
    deps.resume === undefined ? undefined : isWatermarkState(restored) ? "watermark" : "checkpoint";
  const initial: Readonly<Record<string, WatermarkSourceState>> = isWatermarkState(restored)
    ? restored.sources
    : {};
  // `issued` is what the next envelope builds on: every advance issued so far, in call order.
  // `committed` is what `current()` reports: the newest envelope whose boundary committed.
  let issued = initial;
  let committed = initial;
  let issuedCount = 0;
  let committedCount = 0;

  const watermark = <Cursor>(
    sourceKey: string,
    opts?: WatermarkOptions<Cursor>,
  ): Watermark<Cursor> => {
    if (typeof sourceKey !== "string" || sourceKey.length === 0) {
      throw new WorkflowError(`watermark: sourceKey must be a non-empty string.`);
    }
    if (deps.isAllowed?.(sourceKey) === false) {
      throw (
        deps.denied?.(sourceKey) ??
        new WorkflowError(`watermark('${sourceKey}') is not allowed in this run.`)
      );
    }
    // Validate before anything is journaled, exactly like checkpoint itself.
    const retention = normalizeCheckpointRetention(opts?.retention);
    if (owner === "checkpoint") throw new WatermarkScopeError("checkpoint");
    owner = "watermark";

    return {
      current: () => {
        const entry = sourceState(committed, sourceKey);
        return entry === undefined ? opts?.initial : (entry.cursor as Cursor);
      },
      advance: (next: Cursor): Promise<void> => advance(sourceKey, next, retention),
    };
  };

  /**
   * Issue one boundary. Everything up to the checkpoint call runs synchronously, so the clock
   * read and the checkpoint take their seqs at CALL time — exactly like every other journaled
   * call — and a replay journals the same positions however fast a checkpoint resolves.
   *
   * `advance(next)` declares "input is processed through `next`". Every envelope carries every
   * source's cursor, so it builds on every advance ISSUED before it, committed or not: if an
   * earlier boundary's write failed and the body carried on, a later boundary makes that
   * declared cursor durable. That never skips unprocessed input — the body declared it processed.
   * The opposite choice (build only on committed cursors) would make the envelope depend on
   * commit timing and break replay. A cursor that cannot be journaled is refused before any seq.
   */
  const advance = async (
    sourceKey: string,
    next: unknown,
    retention: ReturnType<typeof normalizeCheckpointRetention>,
  ): Promise<void> => {
    if (next === undefined) {
      throw new WorkflowError(`watermark('${sourceKey}').advance: cursor must not be undefined.`);
    }
    const invalid = canonicalJsonError(next);
    if (invalid !== undefined) {
      throw new WorkflowError(
        `watermark('${sourceKey}').advance: cursor is not canonical JSON (${invalid.message}).`,
      );
    }
    const prior = sourceState(issued, sourceKey);
    const observedAt = deps.now();
    // The replaced cursor joins the ring; the oldest entries past `history` are evicted.
    const ring =
      prior === undefined
        ? []
        : [...prior.diagnostics, { cursor: prior.cursor, observedAt: prior.observedAt }];
    const diagnostics = ring.slice(Math.max(0, ring.length - retention.history));
    const updated: Readonly<Record<string, WatermarkSourceState>> = {
      ...issued,
      [sourceKey]: { cursor: next, observedAt, diagnostics },
    };
    const state: WatermarkState = {
      v: WATERMARK_ENVELOPE_VERSION,
      primitive: "watermark",
      source: sourceKey,
      cursor: next,
      observedAt,
      sources: updated,
    };
    issued = updated;
    const position = ++issuedCount;
    await deps.checkpoint({ state, retention });
    // Commits may settle out of order; a newer envelope already contains every older one.
    if (position > committedCount) {
      committedCount = position;
      committed = updated;
    }
  };

  const checkpoint: CheckpointPrimitives["checkpoint"] = async (input) => {
    if (owner === "watermark") throw new WatermarkScopeError("watermark");
    owner = "checkpoint";
    return await deps.checkpoint(input);
  };

  return { watermark, checkpoint };
}
