/**
 * The signal delivery port (GHE #332, design 42 §6) — the ONE path a source event takes to the
 * runs that are parked on it.
 *
 * Reuses the existing resume path: the run controller the registry holds is the same one the
 * reactor resumes for `askUser` / `askAgent` and the scheduler for `waitUntil` — it appends the
 * resolved journal entry and drives the run forward. No parallel resume mechanism.
 *
 * Fan-out: a delivery targets every `watching` run whose park waits on the EXACT tuple
 * `(instance, signal, key)` — the instance columns matter because two different instances may
 * emit the same `(signal, key)`. A park is a single `signal.wait` or a `waitForAny` over several
 * branches; `t3team-workflowSignalWatchMatch.ts` is the one matching rule for both and builds the
 * reply (the payload, or the `{ index, reply }` winner of the branch that matched).
 *
 * Each matched run is woken by `t3team-workflowSignalWake.ts`, through the controller's `offer`:
 * it waits out a drive already in flight and re-reads the row, so two branches of one any-wait
 * firing together cannot both answer it — the first is journaled as the winner (first write
 * wins), the second answers whatever the run waits on next.
 *
 * Durable bridge: the event is written to the durable inbox (`workflow_signal_inbox`) when NO run
 * is parked on the tuple, or when a matched run turned out not to wait on it any more (it lost a
 * race to another branch and moved on). A later wait's drain takes it (first-wins) — the "event
 * landed between two suspensions" guarantee. The inbox is shared by tuple, not per run: when one
 * run took the event and another declined it, the bridged copy may reach the first run's next
 * wait too. That errs towards at-least-once, never towards a lost event. The restart window
 * itself is bridged by the source's durable cursor + catch-up sweep, not by this port.
 *
 * At-least-once delivery (GHE #332 review): a failed wake FAILS the emit, so the source's poller
 * holds its durable cursor and re-emits the transition next tick.
 *
 * Split like the reconciler: `makeSignalDeliveryPort` is the plain, service-free core (unit
 * testable with fake repos/registries); the Effect `Live` layer wires the real services.
 */

import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import type { ProjectionRepositoryError } from "./persistence/Errors.ts";
import {
  T3TeamWorkflowEngineRegistry,
  type T3TeamWorkflowEngineRegistryShape,
} from "./t3team-workflowEngineRegistry.ts";
import { WorkflowSignalStore } from "./persistence/WorkflowSignalStore.ts";
import type { WorkflowRunRepositoryShape } from "./persistence/WorkflowRuns.ts";
import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import type { WorkflowSignalStoreShape } from "./persistence/WorkflowSignalStore.ts";
import {
  T3TeamWorkflowSignalRehydrateGate,
  T3TeamWorkflowSignalRehydrateGateLive,
} from "./t3team-workflowSignalRehydrateGate.ts";
import { wakeParkedSignalRun } from "./t3team-workflowSignalWake.ts";
import { answerParkedWatch, type SignalTuple } from "./t3team-workflowSignalWatchMatch.ts";

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
  /** Deliver one event to every run parked on the tuple; to the durable inbox when none took it.
   * Returns the number of runs woken (0 when the event went to the inbox instead). */
  readonly emit: (input: SignalDeliveryInput) => Effect.Effect<number, ProjectionRepositoryError>;
}

/** T3TeamWorkflowSignalDelivery - service tag for the signal delivery port. */
export class T3TeamWorkflowSignalDelivery extends Context.Service<
  T3TeamWorkflowSignalDelivery,
  WorkflowSignalDeliveryShape
>()("t3/t3team-workflowSignalDelivery/T3TeamWorkflowSignalDelivery") {}

/**
 * The delivery port core as a plain factory (no Context tags): the same fan-out / orphan /
 * inbox-bridge logic the Live layer exposes, over injectable shapes so tests drive it with
 * fakes and no database.
 */
export function makeSignalDeliveryPort(deps: {
  readonly repo: Pick<WorkflowRunRepositoryShape, "listByStatus" | "clearPending" | "getById">;
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
  const emit: ReturnType<typeof makeSignalDeliveryPort>["emit"] = Effect.fn("workflowSignal.emit")(
    function* (input) {
      const tuple: SignalTuple = {
        sourceName: input.sourceName,
        paramsHash: input.paramsHash,
        signalName: input.signalName,
        key: input.key,
      };
      const watching = yield* deps.repo.listByStatus({ status: "watching" });
      const parked = watching.flatMap((run) => {
        const answer = answerParkedWatch(run, tuple, input.payload);
        return answer === undefined ? [] : [{ run, answer }];
      });
      let woken = 0;
      let bridge = parked.length === 0;
      for (const { run, answer } of parked) {
        const outcome = yield* wakeParkedSignalRun({
          run,
          answer,
          tuple,
          payload: input.payload,
          repo: deps.repo,
          registry: deps.registry,
          isRehydrateInFlight: deps.isRehydrateInFlight,
          nowIso,
        });
        if (outcome === "woken") woken += 1;
        if (outcome === "unclaimed") bridge = true;
      }
      if (bridge) {
        // Nobody took it: bridge it durably for the next wait on the tuple instead of dropping it.
        yield* deps.store.insertInboxEntry({ ...tuple, payload: input.payload, createdAt: nowIso() });
      }
      return woken;
    },
  );

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
).pipe(
  // The gate's SINGLE production instance: the rehydrate layer provides the same
  // `T3TeamWorkflowSignalRehydrateGateLive` reference, so both subgraphs memoize to one object —
  // the flag the rehydration effect flips is the flag this port reads. Without this edge the
  // `serviceOption` above resolved to None in production and the orphan-branch safety net was
  // dead (GHE #332 re-review). Tests may still omit the gate; `serviceOption` keeps the layer
  // constructible there.
  Layer.provide(T3TeamWorkflowSignalRehydrateGateLive),
);
