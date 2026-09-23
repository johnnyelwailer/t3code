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
  /** Passed to the underlying checkpoint; `history` also sizes the diagnostics ring. */
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

export function createWatermarkPrimitives(deps: WatermarkPrimitivesDeps): WatermarkPrimitives {
  const restored = deps.resume?.state;
  let owner: "watermark" | "checkpoint" | undefined =
    deps.resume === undefined ? undefined : isWatermarkState(restored) ? "watermark" : "checkpoint";
  let sources: Readonly<Record<string, WatermarkSourceState>> = isWatermarkState(restored)
    ? restored.sources
    : {};

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
        const entry = sources[sourceKey];
        return entry === undefined ? opts?.initial : (entry.cursor as Cursor);
      },
      advance: async (next: Cursor): Promise<void> => {
        if (next === undefined) {
          throw new WorkflowError(
            `watermark('${sourceKey}').advance: cursor must not be undefined.`,
          );
        }
        const previous = sources;
        const prior = previous[sourceKey];
        const observedAt = deps.now();
        // The replaced cursor joins the ring; the oldest entries past `history` are evicted.
        const ring =
          prior === undefined
            ? []
            : [...prior.diagnostics, { cursor: prior.cursor, observedAt: prior.observedAt }];
        const diagnostics = ring.slice(Math.max(0, ring.length - retention.history));
        const updated: Readonly<Record<string, WatermarkSourceState>> = {
          ...previous,
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
        // Update before the await: a concurrent advance on another source builds on this one.
        sources = updated;
        try {
          await deps.checkpoint({ state, retention });
        } catch (error) {
          // Not durable: roll back unless a later advance already built on top of it.
          if (sources === updated) sources = previous;
          throw error;
        }
      },
    };
  };

  const checkpoint: CheckpointPrimitives["checkpoint"] = async (input) => {
    if (owner === "watermark") throw new WatermarkScopeError("watermark");
    owner = "checkpoint";
    return await deps.checkpoint(input);
  };

  return { watermark, checkpoint };
}
