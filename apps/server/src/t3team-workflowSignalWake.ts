/**
 * Waking ONE run the signal delivery port matched to an event (split from
 * `t3team-workflowSignalDelivery.ts`, which owns the fan-out and the inbox bridge).
 *
 * The wake goes through the controller's `offer` whenever it has one — every controller the SDK
 * run host registers does. `offer` waits out a drive of the run that is still in flight and then
 * RE-READS the row, so an event that raced another wake answers the park the run is on NOW: two
 * branches of one `waitForAny` firing together, or an event landing while the run drives to its
 * next park. `resume` would DROP such a call (the host runs one drive at a time), and the event
 * with it. An offer that finds nothing to answer reports `unclaimed`; the port then bridges the
 * event to the inbox for the run's next wait.
 *
 * A run with no controller this uptime is orphaned (failed) rather than parked forever — the
 * scheduler's loop-safety rule, applied to the event wake source — except while boot rehydration
 * is still in flight, when the absence is transient: the run stays parked for the next event.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { PersistenceSqlError } from "./persistence/Errors.ts";
import type { WorkflowRun, WorkflowRunRepositoryShape } from "./persistence/WorkflowRuns.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import {
  answerParkedWatch,
  type SignalTuple,
  type SignalWatchAnswer,
} from "./t3team-workflowSignalWatchMatch.ts";

export type SignalWakeOutcome = "woken" | "unclaimed" | "deferred" | "orphaned";

export const wakeParkedSignalRun = Effect.fn("workflowSignal.wake")(function* (input: {
  /** The row as the port listed it (`watching`), and the answer computed from it. */
  readonly run: WorkflowRun;
  readonly answer: SignalWatchAnswer;
  readonly tuple: SignalTuple;
  readonly payload: unknown;
  readonly repo: Pick<WorkflowRunRepositoryShape, "getById" | "clearPending">;
  readonly registry: Pick<T3TeamWorkflowEngineRegistryShape, "getRun">;
  readonly isRehydrateInFlight?: (() => boolean) | undefined;
  readonly nowIso: () => string;
}) {
  const { run, answer, tuple, payload, repo } = input;
  const controller = input.registry.getRun(run.runId);
  const log = { runId: run.runId, sourceName: tuple.sourceName, signalName: tuple.signalName };
  if (controller === undefined) {
    if (input.isRehydrateInFlight?.() === true) {
      yield* Effect.logWarning(
        "signal delivery: parked run not rehydrated yet; leaving it parked, retrying on the next event",
        log,
      );
      return "deferred" satisfies SignalWakeOutcome;
    }
    yield* Effect.logWarning(
      "signal delivery orphaned a parked run with no registered controller",
      log,
    );
    yield* repo.clearPending({
      runId: run.runId,
      status: "failed",
      updatedAt: input.nowIso(),
      failureReason:
        "This run's watched event arrived, but the run could not be restored (its source or state was gone).",
      failureStep: "signal.wait",
    });
    return "orphaned" satisfies SignalWakeOutcome;
  }
  // At-least-once: a failed wake FAILS the emit, so the source's poller holds its durable cursor
  // and re-emits next tick; first-write-wins on the journal keeps a redelivery from answering a
  // wait twice.
  const failed = (cause: unknown) =>
    new PersistenceSqlError({
      operation: "workflowSignal.resume",
      detail: `delivery resume failed for run ${run.runId}: ${String(cause)}`,
      cause: cause instanceof Error ? cause : new Error(String(cause)),
    });
  const offer = controller.offer;
  if (offer === undefined) {
    yield* Effect.tryPromise({
      try: () => controller.resume(answer.correlationId, answer.reply),
      catch: failed,
    });
    return "woken" satisfies SignalWakeOutcome;
  }
  const decide = () =>
    Effect.runPromise(
      repo
        .getById({ runId: run.runId })
        .pipe(
          Effect.map((row) =>
            Option.isSome(row) && row.value.status === "watching"
              ? answerParkedWatch(row.value, tuple, payload)
              : undefined,
          ),
        ),
    );
  const accepted = yield* Effect.tryPromise({ try: () => offer(decide), catch: failed });
  return (accepted ? "woken" : "unclaimed") satisfies SignalWakeOutcome;
});
