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
 *
 * Three rules keep "resume folds what an uninterrupted run folds" true:
 *
 * - folds commit one at a time and a boundary records committed snapshots only;
 * - a fold inside a black-boxed composition branch is refused (branch calls are not journaled);
 * - a plain `checkpoint()` is refused once a reducer is active (its boundary would drop them).
 */

import type { CheckpointPrimitives, CheckpointRecord, CheckpointRetention } from "./checkpoint.ts";
import { canonicalJsonStringify } from "./canonicalJson.ts";
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
   * boundary. `fold` receives `undefined` on the reducer's first observation. `reducerId` IS the
   * reducer's identity: every call with the same id folds into the same state.
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
  /**
   * True while a composition branch runs black-boxed (`DurablePrimitiveRuntime.isBlackBoxed`).
   * Primitive calls there are not journaled, so a fold there could not be replayed: refused.
   */
  readonly isBlackBoxed: () => boolean;
}

/**
 * The reducer set plus the run's reducer-aware `checkpoint`. A host binds THIS `checkpoint` as the
 * body's checkpoint: a plain boundary carries author state only, so committing one while a reducer
 * is active would make a resume from it silently restart that reducer — it is refused instead.
 */
export interface RunReducePrimitives extends ReducePrimitives {
  readonly checkpoint: CheckpointPrimitives["checkpoint"];
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

export function createReducePrimitives(deps: ReducePrimitivesDeps): RunReducePrimitives {
  // Continue folding from the recorded state: a checkpoint-window resume seeds every reducer from
  // its boundary. The map only ever holds COMMITTED snapshots, so a boundary never records a fold
  // that is still in flight (or that failed).
  const restored = deps.resume?.state;
  const reducers = new Map<string, ReducerSnapshot>(
    isReduceCheckpointState(restored) ? Object.entries(restored.reducers) : [],
  );
  // Fold + commit run one at a time, in call order, so concurrent calls (`Promise.all`) chain
  // deterministically instead of racing from the same prior. An idle call starts synchronously, so
  // its boundary takes its seq at the call site exactly like a direct `checkpoint()`.
  let queue: Promise<unknown> = Promise.resolve();
  let inFlight = 0;

  const refuseInsideBranch = (reducerId: string): void => {
    if (deps.isBlackBoxed()) {
      throw new WorkflowError(
        `accumulate: reducer '${reducerId}' cannot fold inside a parallel/pipeline branch — branch calls are not journaled, so the fold could not be replayed. Fold the branch results after the composition returns.`,
      );
    }
  };

  // The in-memory snapshot is exactly what replay restores: strict canonical JSON, round-tripped.
  // A Date, Map or class instance would survive in memory but come back different on resume.
  const asJournaled = <Value>(reducerId: string, value: Value): Value => {
    try {
      return JSON.parse(canonicalJsonStringify(value, true)) as Value;
    } catch (error) {
      throw new WorkflowError(
        `accumulate: reducer '${reducerId}' state is not canonical JSON — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const foldAndCommit = async <State, Observation>(
    reducerId: string,
    fold: (current: State | undefined, observation: Observation) => State,
    observation: Observation,
    capacity: number,
    retention: CheckpointRetention,
  ): Promise<State> => {
    const prior = reducers.get(reducerId) as ReducerSnapshot<State, Observation> | undefined;
    // The fold gets its own copy: a fold that mutates its input and then throws leaves no trace.
    const current = fold(structuredClone(prior?.current), observation);
    // `undefined` is not canonical JSON: the boundary would record no `current`, fail to decode on
    // resume, and silently restart every reducer. `undefined` stays the "no state yet" input.
    if (current === undefined) {
      throw new WorkflowError(
        `accumulate: the fold for reducer '${reducerId}' returned undefined; return a JSON value (use null for "empty").`,
      );
    }
    const next: ReducerSnapshot<State, Observation> = asJournaled(reducerId, {
      current,
      ring: capacity === 0 ? [] : [...(prior?.ring ?? []), observation].slice(-capacity),
    });
    // Re-checked immediately before the commit, after all user code (the fold) has run: a queued
    // fold starts later than its call, and the fold itself could have entered a composition
    // branch. Nothing runs between this check and the checkpoint's synchronous seq allocation.
    refuseInsideBranch(reducerId);
    await deps.checkpoint({
      state: {
        primitive: REDUCE_STATE_TAG,
        reducerId,
        reducers: { ...Object.fromEntries(reducers), [reducerId]: next },
      },
      retention,
    });
    reducers.set(reducerId, next);
    return structuredClone(next.current);
  };

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
      // Checked at the call site too: that is where "inside a composition branch" is decided.
      refuseInsideBranch(reducerId);
      const { ring, ...retention } = opts?.retention ?? {};
      const capacity = normalizeReduceRing(ring);
      const run = () => foldAndCommit(reducerId, fold, observation, capacity, retention);
      const task = inFlight === 0 ? run() : queue.then(run);
      inFlight += 1;
      queue = task.catch(() => undefined);
      try {
        return await task;
      } finally {
        inFlight -= 1;
      }
    },
    reducerState: <State = unknown, Observation = unknown>(reducerId: string) => {
      const snapshot = reducers.get(reducerId);
      return snapshot === undefined
        ? undefined
        : (structuredClone(snapshot) as ReducerSnapshot<State, Observation>);
    },
    checkpoint: async (input) => {
      if (reducers.size > 0 || inFlight > 0) {
        throw new WorkflowError(
          "checkpoint: a plain checkpoint() cannot follow accumulate() in the same run — its boundary carries author state only, so a resume from it would silently restart every reducer. Carry that state in a reducer instead.",
        );
      }
      return deps.checkpoint(input);
    },
  };
}
