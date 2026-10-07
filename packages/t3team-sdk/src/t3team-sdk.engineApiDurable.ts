/** Durable state and retry accessors for the imported engine API. */
import type {
  CheckpointInput,
  CheckpointPrimitives,
  CheckpointRecord,
} from "@runbook/core/checkpoint";
import type { RetryOptions, RetryPrimitives } from "@runbook/core/retryBackoff";
import type { AccumulateOptions, ReducePrimitives, ReducerSnapshot } from "@runbook/core/reduce";
import { bodyApiStorage } from "./t3team-sdk.internal.ts";
import { fromRun } from "./t3team-sdk.engineApi.ts";

/**
 * Bounded execution (docs/runbook/bounded-execution.md): commit the `(seq, compactState)`
 * boundary that a resume replays from instead of from sequence zero. The input participates in
 * the ordinary argsHash replay check, so a re-driven body whose compact state moved fails loud.
 */
export function checkpoint<State>(input: CheckpointInput<State>): Promise<CheckpointRecord<State>> {
  return fromRun<CheckpointPrimitives["checkpoint"]>("checkpoint")(input);
}

/**
 * Bounded execution: run `fn(attempt)` up to `maxAttempts` times with a durable, journaled backoff
 * (`waitUntil`) between attempts. A resume never re-runs a settled attempt, and a crash mid-backoff
 * wakes at the SAME deadline. Gives up with `RetryExhaustedError` (carrying the last classified
 * failure) on exhaustion or a `"fatal"` classification. Requires the `'schedule'` capability.
 */
export function retry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  return fromRun<RetryPrimitives["retry"]>("retry")(fn, opts);
}

/**
 * Bounded execution: fold `observation` into the reducer's current state and commit it as a
 * checkpoint boundary; a resume continues folding from the recorded state. `fold` receives
 * `undefined` on the reducer's first observation and must be deterministic (its result is part of
 * the journaled boundary, so a drifting fold fails loud). `retention.ring` keeps the last N
 * observations. `reducerId` is the reducer's identity: calls with the same id fold into one state.
 * Refused inside sub-workflow bodies and parallel/pipeline branches; once a reducer is active, a
 * plain `checkpoint()` is refused (its boundary would drop the reducer state).
 */
export function accumulate<State, Observation>(
  reducerId: string,
  fold: (current: State | undefined, observation: Observation) => State,
  observation: Observation,
  opts?: AccumulateOptions,
): Promise<State> {
  return fromRun<ReducePrimitives["accumulate"]>("accumulate")(reducerId, fold, observation, opts);
}

/**
 * The reducer's latest snapshot (`current` + retained `ring`) in this drive — restored by a
 * checkpoint-window resume or folded since; `undefined` before its first fold.
 */
export function reducerState<State = unknown, Observation = unknown>(
  reducerId: string,
): ReducerSnapshot<State, Observation> | undefined {
  return fromRun<ReducePrimitives["reducerState"]>("reducerState")<State, Observation>(reducerId);
}

/**
 * The compact state a checkpoint-window resume restored — seed your carried state from it so the
 * body continues from the boundary instead of re-running the superseded prefix.
 * `undefined` on a fresh start, a full-replay resume, and inside sub-workflow bodies.
 */
export function getResume(): CheckpointRecord | undefined {
  const surface = bodyApiStorage.getStore();
  if (surface === undefined) {
    throw new Error(
      "'getResume' was called outside a workflow runtime. Engine APIs only resolve while an orchestration body is running.",
    );
  }
  return surface.resume as CheckpointRecord | undefined;
}
