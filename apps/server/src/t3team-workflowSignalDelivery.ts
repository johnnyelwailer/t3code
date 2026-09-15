/**
 * The signal delivery port (GHE #332, design 42 §6) — the ONE path a source event takes to the
 * runs that are parked on it.
 *
 * Reuses the existing resume path, verbatim: `registry.getRun(runId).resume(correlationId,
 * payload)` is the same closure the reactor uses for `askUser` / `askAgent` and the scheduler
 * uses for `waitUntil` — appending the resolved journal entry and driving the run forward. No
 * parallel resume mechanism.
 *
 * Fan-out: a delivery targets every `watching` run parked on the EXACT tuple
 * `(instance, signal, key)` — the instance columns matter because two different instances may
 * emit the same `(signal, key)`. A run parked on the tuple but not registered this uptime
 * (never rehydrated: its source or state is gone) is orphaned (marked failed), mirroring the
 * scheduler's `orphanSleepingRun` — otherwise the event is dropped and the row parks forever,
 * re-flagged on every later event.
 *
 * Durable bridge: when NO run is parked on the tuple, the event is written to the durable
 * inbox (`workflow_signal_inbox`); a later `signal.wait` drain takes it (first-wins). This is
 * the "event landed between two suspensions" guarantee — the restart window itself is bridged
 * by the source's durable cursor + catch-up sweep, not by this port.
 */

import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { WorkflowSignalStore } from "./persistence/Services/WorkflowSignalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import type { ProjectionRepositoryError } from "./persistence/Errors.ts";

export interface SignalDeliveryInput {
  readonly sourceName: string;
  readonly paramsHash: string;
  readonly signalName: string;
  readonly key: string;
  /** The decoded, schema-validated payload (validated at the source's `ctx.emit` boundary). */
  readonly payload: unknown;
}

/** WorkflowSignalDeliveryShape - the delivery port API a started source's `ctx.emit` is wired to. */
export interface WorkflowSignalDeliveryShape {
  /** Deliver one event to every parked run on the tuple; to the durable inbox when none is.
   * Returns the number of runs woken (0 when the event went to the inbox instead). */
  readonly emit: (
    input: SignalDeliveryInput,
  ) => Effect.Effect<number, ProjectionRepositoryError>;
}

/** T3TeamWorkflowSignalDelivery - service tag for the signal delivery port. */
export class T3TeamWorkflowSignalDelivery extends Context.Service<
  T3TeamWorkflowSignalDelivery,
  WorkflowSignalDeliveryShape
>()("t3/t3team-workflowSignalDelivery/T3TeamWorkflowSignalDelivery") {}

export const T3TeamWorkflowSignalDeliveryLive = Layer.effect(
  T3TeamWorkflowSignalDelivery,
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const store = yield* WorkflowSignalStore;
    const registry = yield* T3TeamWorkflowEngineRegistry;

    const emit: WorkflowSignalDeliveryShape["emit"] = Effect.fn("workflowSignal.emit")(
      function* (input) {
        const watching = yield* repo.listByStatus({ status: "watching" });
        const parked = watching.filter(
          (run) =>
            run.watchSourceName === input.sourceName &&
            run.watchParamsHash === input.paramsHash &&
            run.watchSignalName === input.signalName &&
            run.watchSignalKey === input.key &&
            run.pendingCorrelationId !== null,
        );
        if (parked.length === 0) {
          // No run is parked on this tuple right now: bridge it durably instead of dropping it.
          yield* store.insertInboxEntry({
            sourceName: input.sourceName,
            paramsHash: input.paramsHash,
            signalName: input.signalName,
            key: input.key,
            payload: input.payload,
            createdAt: DateTime.formatIso(DateTime.nowUnsafe()),
          });
          return 0;
        }
        // Fan out to every parked run on the exact tuple. A run without a registered controller
        // this uptime is orphaned (failed) rather than parked forever — the scheduler's own
        // loop-safety rule, applied to the event wake source.
        let woken = 0;
        for (const run of parked) {
          const controller = registry.getRun(run.runId);
          if (controller === undefined) {
            yield* Effect.logWarning(
              "signal delivery orphaned a parked run with no registered controller",
              { runId: run.runId, sourceName: input.sourceName, signalName: input.signalName },
            );
            yield* repo.clearPending({
              runId: run.runId,
              status: "failed",
              updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
              failureReason:
                "This run's watched event arrived, but the run could not be restored (its source or state was gone).",
              failureStep: "signal.wait",
            });
            continue;
          }
          yield* Effect.promise(() =>
            controller.resume(run.pendingCorrelationId!, input.payload).catch(() => {}),
          );
          woken += 1;
        }
        return woken;
      },
    );

    return { emit };
  }),
);
