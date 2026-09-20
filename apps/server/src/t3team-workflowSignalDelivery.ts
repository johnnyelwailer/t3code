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
 * re-flagged on every later event. While boot rehydration is still in flight the "no
 * controller yet" state is TRANSIENT: the port leaves the run parked and the next event
 * retries it (GHE #332 review — the reconciler's boot reconcile is layer-ordered after
 * rehydration, and this gate is the safety net if that ordering is ever bypassed).
 *
 * At-least-once delivery (GHE #332 review): a failed resume FAILS the emit, so the source's
 * poller holds its durable cursor and re-emits the transition next tick; the engine's
 * argsHash/correlation journal dedup keeps the redelivered event from re-firing external
 * effects on an already-woken run.
 *
 * Durable bridge: when NO run is parked on the tuple, the event is written to the durable
 * inbox (`workflow_signal_inbox`); a later `signal.wait` drain takes it (first-wins). This is
 * the "event landed between two suspensions" guarantee — the restart window itself is bridged
 * by the source's durable cursor + catch-up sweep, not by this port.
 *
 * Split like the reconciler: `makeSignalDeliveryPort` is the plain, service-free core (unit
 * testable with fake repos/registries); the Effect `Live` layer wires the real services.
 */

import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { PersistenceSqlError } from "./persistence/Errors.ts";
import type { ProjectionRepositoryError } from "./persistence/Errors.ts";
import {
  T3TeamWorkflowEngineRegistry,
  type T3TeamWorkflowEngineRegistryShape,
} from "./t3team-workflowEngineRegistry.ts";
import { WorkflowSignalStore } from "./persistence/Services/WorkflowSignalStore.ts";
import type { WorkflowRunRepositoryShape } from "./persistence/Services/WorkflowRuns.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import type { WorkflowSignalStoreShape } from "./persistence/Services/WorkflowSignalStore.ts";

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

/**
 * Boot-rehydration gate (GHE #332 review): while the host is still rebuilding the watching-run
 * controllers at boot, a parked row with no registered controller is TRANSIENT — the delivery
 * port must leave the run parked (retry on the next event) instead of orphan-failing it. The
 * reconciler's layer edge makes rehydration complete before any source instance starts; this
 * flag is the defense-in-depth signal for the rare path where delivery happens mid-rehydrate.
 */
export interface WorkflowSignalRehydrateGateShape {
  readonly isRehydrateInFlight: () => boolean;
  readonly markInFlight: () => void;
  readonly markComplete: () => void;
}

/** T3TeamWorkflowSignalRehydrateGate - service tag for the boot-rehydration gate. */
export class T3TeamWorkflowSignalRehydrateGate extends Context.Service<
  T3TeamWorkflowSignalRehydrateGate,
  WorkflowSignalRehydrateGateShape
>()("t3/t3team-workflowSignalRehydrateGate/T3TeamWorkflowSignalRehydrateGate") {}

export const T3TeamWorkflowSignalRehydrateGateLive = Layer.effect(
  T3TeamWorkflowSignalRehydrateGate,
  Effect.gen(function* () {
    let inFlight = false;
    return {
      isRehydrateInFlight: () => inFlight,
      markInFlight: () => {
        inFlight = true;
      },
      markComplete: () => {
        inFlight = false;
      },
    };
  }),
);

/**
 * The delivery port core as a plain factory (no Context tags): the same fan-out / orphan /
 * inbox-bridge logic the Live layer exposes, over injectable shapes so tests drive it with
 * fakes and no database.
 */
export function makeSignalDeliveryPort(deps: {
  readonly repo: Pick<WorkflowRunRepositoryShape, "listByStatus" | "clearPending">;
  readonly store: Pick<WorkflowSignalStoreShape, "insertInboxEntry">;
  readonly registry: Pick<T3TeamWorkflowEngineRegistryShape, "getRun">;
  /** The boot-rehydration gate; absent in tests/pre-gate hosts, where "no controller" means
   * orphaned as before. */
  readonly isRehydrateInFlight?: () => boolean;
  readonly nowIso?: () => string;
}): {
  readonly emit: (input: SignalDeliveryInput) => Effect.Effect<number, ProjectionRepositoryError>;
} {
  const nowIso = deps.nowIso ?? (() => DateTime.formatIso(DateTime.nowUnsafe()));
  const emit: ReturnType<typeof makeSignalDeliveryPort>["emit"] =
    Effect.fn("workflowSignal.emit")(function* (input) {
      const watching = yield* deps.repo.listByStatus({ status: "watching" });
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
        yield* deps.store.insertInboxEntry({
          sourceName: input.sourceName,
          paramsHash: input.paramsHash,
          signalName: input.signalName,
          key: input.key,
          payload: input.payload,
          createdAt: nowIso(),
        });
        return 0;
      }
      // Fan out to every parked run on the exact tuple. A run without a registered controller
      // this uptime is orphaned (failed) rather than parked forever — the scheduler's own
      // loop-safety rule, applied to the event wake source. While boot rehydration is still in
      // flight the absence is transient: leave the run parked; the next event retries it.
      let woken = 0;
      for (const run of parked) {
        const controller = deps.registry.getRun(run.runId);
        if (controller === undefined) {
          if (deps.isRehydrateInFlight?.() === true) {
            yield* Effect.logWarning(
              "signal delivery: parked run not rehydrated yet; leaving it parked, retrying on the next event",
              {
                runId: run.runId,
                sourceName: input.sourceName,
                signalName: input.signalName,
              },
            );
            continue;
          }
          yield* Effect.logWarning(
            "signal delivery orphaned a parked run with no registered controller",
            { runId: run.runId, sourceName: input.sourceName, signalName: input.signalName },
          );
          yield* deps.repo.clearPending({
            runId: run.runId,
            status: "failed",
            updatedAt: nowIso(),
            failureReason:
              "This run's watched event arrived, but the run could not be restored (its source or state was gone).",
            failureStep: "signal.wait",
          });
          continue;
        }
        // At-least-once: a failed resume FAILS the emit so the source's poller holds its
        // durable cursor and re-emits next tick. The engine's journal dedup (argsHash /
        // correlation replay) keeps the redelivery from re-firing effects on a run that the
        // first attempt already woke.
        yield* Effect.tryPromise({
          try: () => controller.resume(run.pendingCorrelationId!, input.payload),
          catch: (cause) =>
            new PersistenceSqlError({
              operation: "workflowSignal.resume",
              detail: `delivery resume failed for run ${run.runId}: ${String(cause)}`,
              cause: cause instanceof Error ? cause : new Error(String(cause)),
            }),
        });
        woken += 1;
      }
      return woken;
    });

  return { emit };
}

export const T3TeamWorkflowSignalDeliveryLive = Layer.effect(
  T3TeamWorkflowSignalDelivery,
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const store = yield* WorkflowSignalStore;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const gate = Option.getOrUndefined(
      yield* Effect.serviceOption(T3TeamWorkflowSignalRehydrateGate),
    );
    const port = makeSignalDeliveryPort({
      repo,
      store,
      registry,
      ...(gate === undefined ? {} : { isRehydrateInFlight: gate.isRehydrateInFlight }),
    });
    return { emit: port.emit };
  }),
);
