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
import * as Option from "effect/Option";

import { ServerConfig } from "./config.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { WorkflowSignalStore } from "./persistence/Services/WorkflowSignalStore.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { deliverWorkflowFailure } from "./t3team-workflowCompletionMessage.ts";
import { T3TeamWorkflowEngineReactorLive } from "./t3team-workflowEngineReactor.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { resolveRehydratedWorkflowScripts } from "./t3team-workflowRehydrateScripts.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";
import { drainSignalParkInbox } from "./t3team-workflowSignalParkDrain.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import { makeWorkflowRunRehydrator } from "./t3team-workflowRehydrateRun.ts";
import {
  T3TeamWorkflowSignalRehydrateGate,
  T3TeamWorkflowSignalRehydrateGateLive,
} from "./t3team-workflowSignalRehydrateGate.ts";

function nowIso(): string {
  return DateTime.formatIso(DateTime.nowUnsafe());
}

export const rehydrateSuspendedWorkflowRunsCore = Effect.fn("rehydrateSuspendedWorkflowRuns")(
  function* () {
    const repo = yield* WorkflowRunRepository;
    // The signal delivery port's orphan branch treats "no controller registered yet" as
    // TRANSIENT while this gate reports the rehydration as in flight (GHE #332 review). The
    // `Effect.ensuring` below clears the flag on every exit path, success or failure.
    const rehydrateGate = Option.getOrUndefined(
      yield* Effect.serviceOption(T3TeamWorkflowSignalRehydrateGate),
    );
    rehydrateGate?.markInFlight();
    const store = yield* WorkflowJournalStore;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const orchestration = yield* OrchestrationEngineService;
    const serverConfig = yield* ServerConfig;
    const scheduler = yield* T3TeamWorkflowScheduler;
    // Restored runs must keep the same `getTools()` tree they launched with — no more and no less.
    // A body replaying a journaled host-tool call evaluates `getTools().t3team…` before the journal
    // is read, so dropping the bridge breaks a run that HAD it; conversely, handing it to a run
    // that never had it (every ephemeral run has a launch thread, none is granted the bridge) would
    // let a restart quietly upgrade a parked run's powers. So the GRANT decides, never the shape of
    // the row: `host_tool_grant` is NULL exactly when the launch wired no bridge (migration 047).
    const toolBroker = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamToolBroker));
    const suspended = yield* repo.listByStatus({ status: "suspended" });
    const sleeping = yield* repo.listByStatus({ status: "sleeping" });
    const paused = yield* repo.listByStatus({ status: "paused" });
    const queued = yield* repo.listByStatus({ status: "queued" });
    const watching = yield* repo.listByStatus({ status: "watching" });
    const dispatch = (command: Parameters<typeof orchestration.dispatch>[0]): Promise<void> =>
      Effect.runPromise(orchestration.dispatch(command)).then(() => undefined);

    // A process died while executing a non-idempotent live step. Never blindly replay it at
    // boot: surface Needs attention instead of leaving a forever-running orphan — and TELL the
    // launching conversation, or its agent keeps assuming the run is still going.
    const running = yield* repo.listByStatus({ status: "running" });
    for (const run of running) {
      yield* repo.setStatus({ runId: run.runId, status: "failed", updatedAt: nowIso() });
      yield* Effect.logWarning("marked interrupted running workflow failed", { runId: run.runId });
      yield* Effect.promise(() =>
        deliverWorkflowFailure({
          launchThreadId: run.launchThreadId ?? undefined,
          workflowRunId: run.runId,
          errorText: "The server restarted while this run was executing; it was not resumed.",
          dispatch,
          newId: () => t3teamRandomUUID(),
          nowIso,
        }),
      );
    }
    if (
      suspended.length === 0 &&
      sleeping.length === 0 &&
      paused.length === 0 &&
      queued.length === 0 &&
      watching.length === 0
    )
      return;

    // The journal lives in the DB (store), so `runsRoot` only backs the workspace-root default
    // for tool scratch files; the server cwd matches the bootstrapped project's workspace.
    const runsRoot = `${serverConfig.cwd}/.t3team-runs`;

    const { rebuildController, restartQueuedRun } = makeWorkflowRunRehydrator({
      repo,
      store,
      registry,
      runsRoot,
      dispatch,
      rearmScheduler: () => scheduler.rearm(),
      toolBroker,
      nowIso,
      signalStore: Option.getOrUndefined(yield* Effect.serviceOption(WorkflowSignalStore)),
    });

    // Durable queued rows preserve FIFO order (`listByStatus` sorts by creation time). Each
    // detached starter waits on the same fair permit queue used by fresh launches.
    for (const run of queued) {
      yield* restartQueuedRun(run, resolveRehydratedWorkflowScripts(run));
    }

    let restored = 0;
    for (const run of suspended) {
      if (
        run.pendingThreadId === null ||
        run.pendingCorrelationId === null ||
        run.pendingKind === null ||
        run.pendingKind === "signal.wait"
      ) {
        // The `watching` status carries the event park (signal state lives in the signal store,
        // not a thread-parked ask); a `suspended` row is always a thread-parked ask, so a
        // signal.wait kind here means a corrupt row — skip it loudly rather than mis-resume.
        yield* Effect.logWarning("skipping suspended workflow run with no recorded pending ask", {
          runId: run.runId,
        });
        continue;
      }
      // Rebuild, then restore the pending ask so the reactor resolves it as if set this uptime.
      // Recipe-private scripts are re-resolved from the persisted recipe path (migration 043).
      rebuildController(run, yield* resolveRehydratedWorkflowScripts(run));
      registry.setPending(run.pendingThreadId, {
        runId: run.runId,
        correlationId: run.pendingCorrelationId,
        kind: run.pendingKind,
        // The journaled re-drive budget (migration 052): a thread.turn step interrupted by the
        // previous uptime keeps counting its re-drives across restarts instead of getting a
        // fresh 3-attempt budget.
        ...(run.pendingKind === "thread.turn" ? { turnRetries: run.turnRetries ?? 0 } : {}),
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
      rebuildController(run, yield* resolveRehydratedWorkflowScripts(run));
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
      rebuildController(run, yield* resolveRehydratedWorkflowScripts(run));
      restored += 1;
    }

    // Event-parked runs (GHE #332) rebuild exactly like sleeping ones — no reactor ask, no
    // clock to re-arm; the delivery port drives them. The boot-gap bridge: an event that
    // landed in the durable inbox while this uptime was down (the run was not parked-reachable
    // then) is drained NOW, before the reconciler starts any source, so the run wakes with it.
    let woken = 0;
    const watchingSignalStore = Option.getOrUndefined(
      yield* Effect.serviceOption(WorkflowSignalStore),
    );
    for (const run of watching) {
      if (
        run.pendingCorrelationId == null ||
        run.watchSourceName == null ||
        run.watchParamsHash == null ||
        run.watchSignalName == null ||
        run.watchSignalKey == null
      ) {
        yield* Effect.logWarning("skipping watching workflow run with no recorded signal park", {
          runId: run.runId,
        });
        continue;
      }
      rebuildController(run, yield* resolveRehydratedWorkflowScripts(run));
      if (watchingSignalStore !== undefined) {
        // The drain is the shared wake source (explicit resume drains the same way); best-effort
        // by boot design — a failure here must not abort the rest of the rehydration (the
        // sleeping-run re-arm below).
        const drained = yield* drainSignalParkInbox({
          signalStore: watchingSignalStore,
          registry,
          run,
          nowIso,
        });
        woken += drained.drained;
        if (drained.warning !== undefined) {
          yield* Effect.logWarning(drained.warning.message, drained.warning.details);
        }
      }
    }

    // Arm the single soonest-deadline timer over every rebuilt sleeping run. A past-due deadline
    // computes a 0ms delay and fires immediately — the downtime catch-up guarantee.
    yield* Effect.promise(() => scheduler.rearm());

    yield* Effect.logInfo("rehydrated durable workflow runs", { restored, armed, woken });
  },
);

/** The exported rehydration effect: the core above plus the boot-rehydration gate cleanup —
 * `markComplete` runs on every exit path so the delivery port's "transient absence" window
 * closes exactly when rehydration is done (success or failure). */
export const rehydrateSuspendedWorkflowRuns = () =>
  rehydrateSuspendedWorkflowRunsCore().pipe(
    Effect.ensuring(
      Effect.gen(function* () {
        const gate = Option.getOrUndefined(
          yield* Effect.serviceOption(T3TeamWorkflowSignalRehydrateGate),
        );
        gate?.markComplete();
      }),
    ),
  );

/**
 * Boot layer wiring {@link rehydrateSuspendedWorkflowRuns} into server startup (see the file
 * header for the ordering contract). `Layer.provide` sequences the underlying build — the
 * merge-all app layer builds sibling layers concurrently (`mergeAllEffect`), so without an
 * explicit dependency edge the reactor's subscription and this rehydration could race; piping
 * through `T3TeamWorkflowEngineReactorLive` forces its build (and the `forkScoped` stream
 * subscription inside it) to complete before this effect runs, so every restored pending ask
 * is guaranteed to have a live reactor watching for it. The layer is memoized by reference, so
 * this does not double-subscribe the reactor when both layers are merged into the same app.
 *
 * A rehydration failure is logged, never rethrown — restoring durable runs is best-effort and
 * must not crash boot.
 */
export const T3TeamWorkflowEngineRehydrateLive = Layer.effectDiscard(
  rehydrateSuspendedWorkflowRuns().pipe(
    Effect.catchCause((cause) =>
      Effect.logError("t3team workflow-engine rehydration failed on boot", {
        cause: Cause.pretty(cause),
      }),
    ),
  ),
).pipe(
  Layer.provide(T3TeamWorkflowEngineReactorLive),
  Layer.provide(T3TeamWorkflowSignalRehydrateGateLive),
);
