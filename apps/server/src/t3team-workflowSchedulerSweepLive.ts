/**
 * The workflow scheduler's wake sweep as a due-work source on the server's `Scheduler` (Epic 27).
 *
 * Each tick reads the `sleeping` runs and resumes every one whose `wake_at` has passed, through
 * the registry's resume closure — the reactor's resume path, clock-triggered. A due row without a
 * closure this uptime is orphaned and its launch thread is told through the workflow host.
 *
 * The sweep does nothing until the gate (`T3TeamWorkflowScheduler`) opens: boot rehydration opens
 * it once every sleeping run's closure is rebuilt, and opening runs one catch-up pass. Mount this
 * layer where the workflow host is in context (next to the workflow reactor in server.ts).
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import * as Scheduler from "./scheduling/Scheduler.ts";
import { deliverWorkflowFailure } from "./t3team-workflowCompletionMessage.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowHost, toWorkflowHostPort } from "./t3team-workflowHost.ts";
import {
  makeWorkflowScheduler,
  T3TeamWorkflowScheduler,
  toSchedulerSleepingRun,
  type SchedulerSleepingRun,
} from "./t3team-workflowScheduler.ts";
import { makeSchedulerResume, orphanSleepingRun } from "./t3team-workflowSchedulerResume.ts";

export const T3TeamWorkflowSchedulerSweepLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const gate = yield* T3TeamWorkflowScheduler;
    const host = toWorkflowHostPort(yield* T3TeamWorkflowHost);

    const listSleeping = (): Promise<ReadonlyArray<SchedulerSleepingRun>> =>
      Effect.runPromise(repo.listByStatus({ status: "sleeping" })).then((rows) =>
        rows
          .map(toSchedulerSleepingRun)
          .filter((run): run is SchedulerSleepingRun => run !== undefined),
      );

    const resume = makeSchedulerResume({
      getRun: (runId) => registry.getRun(runId),
      orphan: (runId, correlationId) =>
        orphanSleepingRun(repo, runId, correlationId, (launchThreadId, errorText) =>
          deliverWorkflowFailure({ launchThreadId, workflowRunId: runId, errorText, host }),
        ),
    });

    const sweep = makeWorkflowScheduler({
      listSleeping,
      resume,
      onWarn: (message, fields) => {
        Effect.runFork(Effect.logWarning(message, fields));
      },
    });

    yield* (yield* Scheduler.Scheduler).register(
      "t3team-workflow-wake",
      Effect.promise(() => sweep.runDue()),
    );
    // The gate opens once boot rehydration rebuilt the closures; opening the sweep then runs its
    // catch-up pass for deadlines that passed while the server was down.
    yield* Effect.promise(() => gate.opened.then(() => sweep.rearm())).pipe(Effect.forkScoped);
  }),
).pipe(Layer.provide(Scheduler.layer));
