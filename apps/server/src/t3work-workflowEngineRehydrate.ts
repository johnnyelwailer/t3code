/**
 * Boot rehydration for durable workflow runs (Epic 25 §Open question 2).
 *
 * On startup — after the orchestration reactors are live, before the welcome event — every
 * `workflow_runs` row in status `suspended` is rebuilt into a live, resumable run:
 *   • DATA from the DB — workflow path, launch args, project/model/mode, and the pending ask —
 *     is read off the row.
 *   • CODE from the host layers — the orchestration `dispatch`, the SQLite journal store, the
 *     in-memory registry, the lifecycle write-through — is reconstructed here and handed to
 *     {@link createWorkflowRunController}, the SAME builder the live launch uses.
 * The controller re-registers the run's `resume` closure; restoring the pending ask into the
 * in-memory registry then makes the reactor behave identically whether the ask was set this
 * uptime or recovered from a prior one. No local-disk journal is involved — replay reads the
 * DB-backed journal through the injected store.
 *
 * ── Clock-parked runs (Epic 27) ──────────────────────────────────────────────
 * A run parked on `waitUntil` is in status `sleeping`, not `suspended`. It rebuilds the same
 * resume closure (so the scheduler can drive it forward), but is woken by the CLOCK, not an
 * event — so it does NOT restore a reactor pending ask; instead the scheduler re-arms its
 * `wake_at`. A deadline that passed during downtime fires immediately on the first arm. The
 * rebuilt lifecycle's `onSleep` re-pokes the scheduler so a run that sleeps again keeps the
 * soonest-deadline timer current.
 *
 * Single-instance only (Epic 25 §Out of scope): no lease/lock, so this assumes one server owns
 * these rows. A row whose pending ask is missing is logged and skipped (it cannot be resolved).
 */

import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ServerConfig } from "./config.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { t3workRandomUUID } from "./t3work-random.ts";
import { makeWorkflowRunLifecycle } from "./t3work-workflowEngineDurability.ts";
import {
  createWorkflowRunController,
  launchWorkflowRecipe,
} from "./t3work-workflowEngineLaunch.ts";
import { T3workWorkflowEngineReactorLive } from "./t3work-workflowEngineReactor.ts";
import { T3workWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";
import { T3workWorkflowScheduler } from "./t3work-workflowScheduler.ts";
import { resolveWorkflowAgentModel } from "./t3work-workflowAgentModelPolicy.ts";

function nowIso(): string {
  return DateTime.formatIso(DateTime.nowUnsafe());
}

export const rehydrateSuspendedWorkflowRuns = Effect.fn("rehydrateSuspendedWorkflowRuns")(
  function* () {
    const repo = yield* WorkflowRunRepository;
    const store = yield* WorkflowJournalStore;
    const registry = yield* T3workWorkflowEngineRegistry;
    const orchestration = yield* OrchestrationEngineService;
    const serverConfig = yield* ServerConfig;
    const scheduler = yield* T3workWorkflowScheduler;

    const suspended = yield* repo.listByStatus({ status: "suspended" });
    const sleeping = yield* repo.listByStatus({ status: "sleeping" });
    const paused = yield* repo.listByStatus({ status: "paused" });
    const queued = yield* repo.listByStatus({ status: "queued" });
    // A process died while executing a non-idempotent live step. Never blindly replay it at
    // boot: surface Needs attention instead of leaving a forever-running orphan.
    const running = yield* repo.listByStatus({ status: "running" });
    for (const run of running) {
      yield* repo.setStatus({ runId: run.runId, status: "failed", updatedAt: nowIso() });
      yield* Effect.logWarning("marked interrupted running workflow failed", { runId: run.runId });
    }
    if (
      suspended.length === 0 &&
      sleeping.length === 0 &&
      paused.length === 0 &&
      queued.length === 0
    )
      return;

    // The journal lives in the DB (store), so `runsRoot` only backs the workspace-root default
    // for tool scratch files; the server cwd matches the bootstrapped project's workspace.
    const runsRoot = `${serverConfig.cwd}/.t3work-runs`;
    const dispatch = (command: Parameters<typeof orchestration.dispatch>[0]): Promise<void> =>
      Effect.runPromise(orchestration.dispatch(command)).then(() => undefined);

    // Rebuild the resume closure (CODE from layers) over the persisted DATA. Shared by both wake
    // sources — the reactor (suspended) and the scheduler (sleeping) — so a restored run drives
    // forward identically. `onSleep` re-arms the scheduler whenever a rebuilt run parks on a new
    // `waitUntil` after resuming.
    const rebuildController = (run: (typeof suspended)[number]): void => {
      const lifecycle = makeWorkflowRunLifecycle({
        repo,
        row: run,
        nowIso,
        onSleep: () => {
          void scheduler.rearm();
        },
      });
      createWorkflowRunController({
        runId: run.runId,
        workflowPath: run.workflowPath,
        args: run.args,
        runsRoot,
        launchThreadId: run.launchThreadId ?? undefined,
        projectId: run.projectId,
        modelSelection: run.modelSelection,
        defaultAgentModelSelection: resolveWorkflowAgentModel(run.modelSelection),
        runtimeMode: run.runtimeMode,
        interactionMode: run.interactionMode,
        registry,
        dispatch,
        newId: () => t3workRandomUUID(),
        nowIso,
        store,
        lifecycle,
      });
      registry.registerMasterStop(run.runId, () =>
        Effect.runPromise(
          repo.clearPending({ runId: run.runId, status: "cancelled", updatedAt: nowIso() }),
        ),
      );
    };

    // Durable queued rows preserve FIFO order (`listByStatus` sorts by creation time). Each
    // detached starter waits on the same fair permit queue used by fresh launches.
    for (const run of queued) {
      const lifecycle = makeWorkflowRunLifecycle({
        repo,
        row: run,
        nowIso,
        onSleep: () => {
          void scheduler.rearm();
        },
      });
      registry.registerOwnership(run.runId, run.launchThreadId ?? undefined);
      registry.registerMasterStop(run.runId, () =>
        Effect.runPromise(
          repo.clearPending({ runId: run.runId, status: "cancelled", updatedAt: nowIso() }),
        ),
      );
      yield* Effect.promise(async () => {
        if (!(await lifecycle.recordActive())) return;
        await launchWorkflowRecipe({
          runId: run.runId,
          workflowPath: run.workflowPath,
          args: run.args,
          runsRoot,
          launchThreadId: run.launchThreadId ?? undefined,
          projectId: run.projectId,
          modelSelection: run.modelSelection,
          defaultAgentModelSelection: resolveWorkflowAgentModel(run.modelSelection),
          runtimeMode: run.runtimeMode,
          interactionMode: run.interactionMode,
          registry,
          dispatch,
          newId: () => t3workRandomUUID(),
          nowIso,
          store,
          lifecycle,
          lifecycleAlreadyRunning: true,
        });
      }).pipe(Effect.forkDetach({ startImmediately: true }));
    }

    let restored = 0;
    for (const run of suspended) {
      if (
        run.pendingThreadId === null ||
        run.pendingCorrelationId === null ||
        run.pendingKind === null
      ) {
        yield* Effect.logWarning("skipping suspended workflow run with no recorded pending ask", {
          runId: run.runId,
        });
        continue;
      }
      // Rebuild, then restore the pending ask so the reactor resolves it as if set this uptime.
      rebuildController(run);
      registry.setPending(run.pendingThreadId, {
        runId: run.runId,
        correlationId: run.pendingCorrelationId,
        kind: run.pendingKind,
      });
      restored += 1;
    }

    let armed = 0;
    for (const run of sleeping) {
      if (run.pendingCorrelationId === null || run.wakeAt === null) {
        yield* Effect.logWarning("skipping sleeping workflow run with no recorded wake deadline", {
          runId: run.runId,
        });
        continue;
      }
      // Rebuild the resume closure; the scheduler (re-armed below) wakes it at `wake_at`. No
      // reactor pending ask — the clock, not an event, resolves a sleeping run.
      rebuildController(run);
      armed += 1;
    }

    // Paused runs keep their parked ask/timer data, but have no live event or clock wake source.
    // Rebuild only the controller so an explicit Resume can restore the same continuation.
    for (const run of paused) {
      if (run.pendingCorrelationId === null) {
        yield* Effect.logWarning("skipping paused workflow run with no continuation", {
          runId: run.runId,
        });
        continue;
      }
      rebuildController(run);
      restored += 1;
    }

    // Arm the single soonest-deadline timer over every rebuilt sleeping run. A past-due deadline
    // computes a 0ms delay and fires immediately — the downtime catch-up guarantee.
    yield* Effect.promise(() => scheduler.rearm());

    yield* Effect.logInfo("rehydrated durable workflow runs", { restored, armed });
  },
);

/**
 * Boot layer wiring {@link rehydrateSuspendedWorkflowRuns} into server startup (see the file
 * header for the ordering contract). `Layer.provide` sequences the underlying build — the
 * merge-all app layer builds sibling layers concurrently (`mergeAllEffect`), so without an
 * explicit dependency edge the reactor's subscription and this rehydration could race; piping
 * through `T3workWorkflowEngineReactorLive` forces its build (and the `forkScoped` stream
 * subscription inside it) to complete before this effect runs, so every restored pending ask
 * is guaranteed to have a live reactor watching for it. The layer is memoized by reference, so
 * this does not double-subscribe the reactor when both layers are merged into the same app.
 *
 * A rehydration failure is logged, never rethrown — restoring durable runs is best-effort and
 * must not crash boot.
 */
export const T3workWorkflowEngineRehydrateLive = Layer.effectDiscard(
  rehydrateSuspendedWorkflowRuns().pipe(
    Effect.catchCause((cause) =>
      Effect.logError("t3work workflow-engine rehydration failed on boot", {
        cause: Cause.pretty(cause),
      }),
    ),
  ),
).pipe(Layer.provide(T3workWorkflowEngineReactorLive));
