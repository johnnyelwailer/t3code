/**
 * Bounded execution — the `reduce` / `accumulate` primitive: fold observations into a compact
 * current state, optionally retaining the last `N` observations.
 *
 * Design invariants (docs/runbook/bounded-execution.md, the `reduce` / `accumulate` row):
 *
 * - durable journal shape: reducer identity, current state, optional observation (the ring);
 * - replay rule: continue folding from the recorded state;
 * - retention: replace the prior state, plus an optional last-`N` observation ring.
 *
 * No private compaction format: every fold commits through the host's `checkpoint` primitive, so
 * the journal kind, the argsHash drift check, the replay window (`selectReplayWindow`) and the
 * checkpoint retention vocabulary are exactly the checkpoint's. The fold state is a discriminated
 * checkpoint `state` ({@link ReduceCheckpointState}) that carries EVERY reducer of the run, so a
 * checkpoint-window resume restores all of them — not just the one that folded last.
 *
 * The fold itself is ordinary body code: it runs on every drive (live and replay), and its output
 * is part of the journaled checkpoint args, so a fold that is not deterministic fails loud as
 * replay drift instead of silently diverging.
 */

import type { CheckpointPrimitives, CheckpointRecord, CheckpointRetention } from "./checkpoint.ts";
import { WorkflowError } from "./errors.ts";

/** Discriminant marking a checkpoint `state` as reducer state rather than author state. */
export const REDUCE_STATE_TAG = "reduce";

/** Checkpoint retention (inherited defaults) plus the optional last-`N` observation ring. */
export interface ReduceRetention extends CheckpointRetention {
  /** Most recent observations kept beside the current state. Default 0: none. */
  readonly ring?: number;
}

export interface AccumulateOptions {
  readonly retention?: ReduceRetention;
}

/** One reducer's recorded fold: its current state and its retained observations, oldest first. */
export interface ReducerSnapshot<State = unknown, Observation = unknown> {
  readonly current: State;
  readonly ring: readonly Observation[];
}

/** The checkpoint `state` an `accumulate` commits. */
export interface ReduceCheckpointState {
  readonly primitive: typeof REDUCE_STATE_TAG;
  /** The reducer this boundary folded. */
  readonly reducerId: string;
  /** Every reducer of the run at this boundary, keyed by reducer identity. */
  readonly reducers: Readonly<Record<string, ReducerSnapshot>>;
}

export interface ReducePrimitives {
  /**
   * Fold `observation` into the reducer's current state and commit the result as a checkpoint
   * boundary. `fold` receives `undefined` on the reducer's first observation.
   */
  readonly accumulate: <State, Observation>(
    reducerId: string,
    fold: (current: State | undefined, observation: Observation) => State,
    observation: Observation,
    opts?: AccumulateOptions,
  ) => Promise<State>;
  /**
   * The reducer's latest snapshot in this drive — restored from the checkpoint-window resume
   * boundary, or folded since. `undefined` before its first fold.
   */
  readonly reducerState: <State = unknown, Observation = unknown>(
    reducerId: string,
  ) => ReducerSnapshot<State, Observation> | undefined;
}

export interface ReducePrimitivesDeps {
  /** The run's `checkpoint` primitive; every fold commits through it. */
  readonly checkpoint: CheckpointPrimitives["checkpoint"];
  /** The checkpoint a checkpoint-window resume restored. Absent on fresh and full-replay drives. */
  readonly resume?: CheckpointRecord | undefined;
}

/** Validate the optional ring capacity before anything is folded or journaled. */
export function normalizeReduceRing(ring: number | undefined): number {
  const capacity = ring ?? 0;
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new WorkflowError(
      `accumulate: retention.ring must be a non-negative integer (got ${String(capacity)}).`,
    );
  }
  return capacity;
}

/** True when a checkpoint `state` decodes as a structurally valid {@link ReduceCheckpointState}. */
export function isReduceCheckpointState(state: unknown): state is ReduceCheckpointState {
  if (typeof state !== "object" || state === null) return false;
  const candidate = state as Record<string, unknown>;
  if (candidate.primitive !== REDUCE_STATE_TAG || typeof candidate.reducerId !== "string")
    return false;
  const reducers = candidate.reducers;
  if (typeof reducers !== "object" || reducers === null || Array.isArray(reducers)) return false;
  return Object.values(reducers).every(
    (snapshot) =>
      typeof snapshot === "object" &&
      snapshot !== null &&
      "current" in snapshot &&
      Array.isArray((snapshot as { readonly ring?: unknown }).ring),
  );
}

export function createReducePrimitives(deps: ReducePrimitivesDeps): ReducePrimitives {
  // Continue folding from the recorded state: a checkpoint-window resume seeds every reducer
  // from its boundary. A plain `checkpoint()` boundary carries author state only — reducers
  // restart from `undefined` across it, exactly as any carried variable the author left out.
  const restored = deps.resume?.state;
  const reducers = new Map<string, ReducerSnapshot>(
    isReduceCheckpointState(restored) ? Object.entries(restored.reducers) : [],
  );

  return {
    accumulate: async <State, Observation>(
      reducerId: string,
      fold: (current: State | undefined, observation: Observation) => State,
      observation: Observation,
      opts?: AccumulateOptions,
    ): Promise<State> => {
      if (typeof reducerId !== "string" || reducerId.length === 0) {
        throw new WorkflowError("accumulate: reducerId must be a non-empty string.");
      }
      const { ring, ...retention } = opts?.retention ?? {};
      const capacity = normalizeReduceRing(ring);
      const prior = reducers.get(reducerId) as ReducerSnapshot<State, Observation> | undefined;
      const next: ReducerSnapshot<State, Observation> = {
        current: fold(prior?.current, observation),
        ring: capacity === 0 ? [] : [...(prior?.ring ?? []), observation].slice(-capacity),
      };
      // Advance before the commit so interleaved folds (under `parallel`) chain instead of
      // racing from the same prior; roll back only if nothing folded on top in the meantime.
      reducers.set(reducerId, next);
      try {
        await deps.checkpoint({
          state: {
            primitive: REDUCE_STATE_TAG,
            reducerId,
            reducers: Object.fromEntries(reducers),
          },
          retention,
        });
      } catch (error) {
        if (reducers.get(reducerId) === next) {
          if (prior === undefined) reducers.delete(reducerId);
          else reducers.set(reducerId, prior);
        }
        throw error;
      }
      return next.current;
    },
    reducerState: <State = unknown, Observation = unknown>(reducerId: string) =>
      reducers.get(reducerId) as ReducerSnapshot<State, Observation> | undefined,
  };
}
