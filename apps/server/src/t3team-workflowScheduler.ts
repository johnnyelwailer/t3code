/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
// @effect-diagnostics globalTimers:off -- the scheduler is the one component that bridges real
// wall-clock time to the engine: it owns a single host timer (injectable for tests) armed for
// the soonest deadline, not an Effect fiber sleep. Workflow bodies still read the journaled
// `now()`; only the scheduler touches the real clock.
/**
 * The workflow scheduler (Epic 27 §The scheduler service) — the clock-based peer to the event
 * reactor (`t3team-workflowEngineReactor.ts`). Where the reactor wakes a run parked on
 * `askUser` / `askAgent` when a domain event lands, the scheduler wakes a run parked on
 * `waitUntil` when the wall clock reaches its deadline.
 *
 * It owns the durable wake deadlines: `workflow_runs` rows in status `sleeping` carry a
 * `wake_at` instant and the `waitUntil` correlation they parked on. The scheduler indexes that
 * set into ONE process timer armed for the SOONEST `wake_at`; on fire it resumes every due run
 * by appending its `waitUntil` reply — the exact `registry.getRun(runId).resume(...)` path the
 * reactor uses, just clock-triggered — then re-arms for the next deadline.
 *
 * ── Durability ───────────────────────────────────────────────────────────────
 * The timer lives only in memory, but the deadlines live in the DB. On boot
 * (`rehydrateSuspendedWorkflowRuns`, after it rebuilds each sleeping run's resume closure)
 * {@link WorkflowScheduler.rearm} re-reads the sleeping set and re-arms. A deadline that PASSED
 * during downtime arms at the {@link MIN_DUE_DELAY_MS} floor and fires almost immediately
 * (catch-up); the floor exists so a due row whose resume is a no-op cannot hot-loop. As runs
 * park or wake at runtime, the lifecycle pokes `rearm` so the soonest-deadline timer stays
 * current.
 *
 * Single-instance only (Epic 27 §Open question 4): no lease/leader, so this assumes one server
 * owns the sleeping rows. A replicated deployment would wake a run once per instance.
 *
 * The scheduler is the only clock authority for waking runs: workflow bodies read the journaled
 * `now()` for timing decisions; the scheduler reads the real clock and pokes the engine, which
 * keeps replay deterministic while still being time-driven.
 */

import * as NodeTimers from "node:timers";

import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { deliverWorkflowFailure } from "./t3team-workflowCompletionMessage.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeSchedulerResume, orphanSleepingRun } from "./t3team-workflowSchedulerResume.ts";

/** Floor for a re-arm delay of an already-due row. A due row whose resume is a no-op (unregistered
 * run, or a reply resolved by a crashed process) would otherwise re-arm at delay 0 forever — a
 * setTimeout(0) hot loop that hammers `listSleeping`. Capping to 1s makes at most one wake attempt
 * per second while a legitimate in-flight resume settles; the orphan paths remove the dead row. */

// The scheduler logic itself; re-exported so existing importers of this module keep resolving.
export * from "./t3team-workflowSchedulerCore.ts";
import {
  makeWorkflowScheduler,
  toSchedulerSleepingRun,
  type SchedulerSleepingRun,
  type WorkflowScheduler,
} from "./t3team-workflowSchedulerCore.ts";

/** The scheduler as a host service — a peer to the registry/reactor singletons. Its value is
 * the Promise-based {@link WorkflowScheduler}, so both Effect callers (boot rehydration) and
 * Promise callers (the lifecycle's sleep poke) drive the same timer. */
export class T3TeamWorkflowScheduler extends Context.Service<
  T3TeamWorkflowScheduler,
  WorkflowScheduler
>()("t3/t3team-workflowScheduler/T3TeamWorkflowScheduler") {}

export const T3TeamWorkflowSchedulerLive = Layer.effect(
  T3TeamWorkflowScheduler,
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    // Optional on purpose: harnesses without an orchestration engine still get a
    // working scheduler — orphaned runs then only log instead of messaging.
    const orchestration = Option.getOrUndefined(
      yield* Effect.serviceOption(OrchestrationEngineService),
    );

    const listSleeping = (): Promise<ReadonlyArray<SchedulerSleepingRun>> =>
      Effect.runPromise(repo.listByStatus({ status: "sleeping" })).then((rows) =>
        rows
          .map(toSchedulerSleepingRun)
          .filter((run): run is SchedulerSleepingRun => run !== undefined),
      );

    const resume = makeSchedulerResume({
      getRun: (runId) => registry.getRun(runId),
      orphan: (runId, correlationId) =>
        orphanSleepingRun(
          repo,
          runId,
          correlationId,
          orchestration === undefined
            ? undefined
            : (launchThreadId, errorText) =>
                deliverWorkflowFailure({
                  launchThreadId,
                  workflowRunId: runId,
                  errorText,
                  dispatch: (command) =>
                    Effect.runPromise(orchestration.dispatch(command)).then(() => undefined),
                  newId: () => t3teamRandomUUID(),
                  nowIso: () => DateTime.formatIso(DateTime.nowUnsafe()),
                }),
        ),
    });

    const scheduler = makeWorkflowScheduler({
      listSleeping,
      resume,
      onWarn: (message, fields) => {
        Effect.runFork(Effect.logWarning(message, fields));
      },
    });

    yield* Effect.addFinalizer(() => Effect.sync(() => scheduler.stop()));
    return scheduler;
  }),
);
