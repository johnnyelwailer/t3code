/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
// @effect-diagnostics nodeBuiltinImport:off - scheduler durability test reads a workflow fixture + temp dir.
/**
 * Scheduler durability acceptance (Epic 27 §The scheduler service — the load-bearing slice).
 * The whole point: a run parked on `waitUntil` survives a server restart because BOTH its replay
 * journal (SqliteJournalStore) and its run record (`workflow_runs`, status `sleeping` + `wake_at`)
 * live in SQLite, and a scheduler — re-armed purely from the DB on boot — wakes it on the wall
 * clock with NO manual resume.
 *
 * Each test launches the timer recipe (`now()` → `waitUntil(deadline)`) through the REAL launch
 * path with the DB-backed store + lifecycle, asserts the DB holds a `sleeping` row + `wake_at` +
 * a `wait.until` sent journal entry, then DISCARDS the in-memory registry AND scheduler to
 * simulate a restart. It rebuilds the resume closures purely from the DB (boot rehydration's
 * role) and arms a FRESH scheduler from the DB's `wake_at` (the scheduler's role) — driven by an
 * injected clock so the deadline fires deterministically — until the run completes with the
 * schema-validated result. A past-due deadline arms a 0ms delay and fires immediately (the
 * downtime catch-up guarantee).
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { assert, it } from "@effect/vitest";
import { type OrchestrationCommand, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterAll } from "vite-plus/test";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowJournalStoreLive } from "./persistence/Layers/SqliteJournalStore.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import {
  WorkflowRunRepository,
  type WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3work-workflowEngineDurability.ts";
import {
  createWorkflowRunController,
  launchWorkflowRecipe,
} from "./t3work-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";
import {
  makeWorkflowScheduler,
  toSchedulerSleepingRun,
  type WorkflowSchedulerClock,
} from "./t3work-workflowScheduler.ts";

const workflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3work-exampleTimer.workflow.ts", import.meta.url),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3work-scheduler-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const projectId = ProjectId.make("proj-scheduler");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const nowIso = (): string => "2026-06-08T00:00:00.000Z";
const noopDispatch = (_command: OrchestrationCommand): Promise<void> => Promise.resolve();

const HOUR_MS = 60 * 60 * 1000;

/** A test clock whose `now` is mutable and whose single armed timer is captured, so a test can
 * assert the computed delay and fire the deadline deterministically (then await the resume). */
function makeManualClock(startMs: number): {
  readonly clock: WorkflowSchedulerClock;
  readonly setNow: (ms: number) => void;
  readonly armedDelay: () => number | undefined;
  readonly fire: () => Promise<void>;
} {
  let nowMs = startMs;
  let armed: { readonly cb: () => unknown; readonly delayMs: number } | undefined;
  return {
    clock: {
      now: () => nowMs,
      setTimer: (cb, delayMs) => {
        armed = { cb, delayMs };
        return { handle: true };
      },
      clearTimer: () => {
        armed = undefined;
      },
    },
    setNow: (ms) => {
      nowMs = ms;
    },
    armedDelay: () => armed?.delayMs,
    fire: async () => {
      const current = armed;
      armed = undefined;
      await current?.cb();
    },
  };
}

const schedulerLayer = it.layer(
  Layer.mergeAll(
    WorkflowRunRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    WorkflowJournalStoreLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    SqlitePersistenceMemory,
  ),
);

/** Boot rehydration's role for clock-parked runs: rebuild every `sleeping` run's resume closure
 * into a FRESH registry from the DB (no reactor pending ask — the clock resolves it). Returns the
 * registry the scheduler resumes through, plus the captured completed outputs. */
const rebuildSleepingFromDb = (
  repo: WorkflowRunRepositoryShape,
  store: import("@t3work/sdk").JournalStore,
  completed: Array<Record<string, unknown>>,
) =>
  Effect.gen(function* () {
    const registry = makeWorkflowEngineRegistry();
    const rows = yield* repo.listByStatus({ status: "sleeping" });
    for (const row of rows) {
      createWorkflowRunController({
        runId: row.runId,
        workflowPath: row.workflowPath,
        args: row.args,
        runsRoot,
        launchThreadId: row.launchThreadId ?? undefined,
        projectId: row.projectId,
        modelSelection: row.modelSelection,
        runtimeMode: row.runtimeMode,
        interactionMode: row.interactionMode,
        registry,
        dispatch: noopDispatch,
        newId: () => "id",
        nowIso,
        store,
        lifecycle: makeWorkflowRunLifecycle({ repo, row, nowIso }),
        onComplete: (output) => {
          completed.push(output as Record<string, unknown>);
          return Promise.resolve();
        },
      });
    }
    return registry;
  });

/** Launch the timer recipe through the real launch path; returns its runId once it has parked. */
const launchTimer = (
  repo: WorkflowRunRepositoryShape,
  store: import("@t3work/sdk").JournalStore,
  runId: string,
  delayMs: number,
) =>
  Effect.gen(function* () {
    const args = { delayMs };
    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        runId,
        workflowPath,
        args,
        runsRoot,
        launchThreadId: `launch-${runId}`,
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        registry: makeWorkflowEngineRegistry(),
        dispatch: noopDispatch,
        newId: () => `${runId}-id`,
        nowIso,
        store,
        lifecycle: makeWorkflowRunLifecycle({
          repo,
          row: buildRunningWorkflowRunRow({
            runId,
            workflowPath,
            args,
            launchThreadId: `launch-${runId}`,
            projectId,
            modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            nowIso: nowIso(),
          }),
          nowIso,
        }),
      }),
    );
    return launched;
  });

schedulerLayer("workflow scheduler — DB-backed clock park survives a restart", (it) => {
  it.effect("arms wake_at from the DB after a restart, fires at the deadline, and resumes", () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const store = yield* WorkflowJournalStore;
      const runId = "sleep-fires";

      // ── Launch: the body computes now()+1h and parks on waitUntil ──────────
      const launched = yield* launchTimer(repo, store, runId, HOUR_MS);
      assert.strictEqual(launched.status, "suspended"); // a clock park reports suspended to the caller

      // ── DB holds a sleeping run with a future wake_at + the wait.until journal entry ──
      const sleepingRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(sleepingRow.status, "sleeping");
      assert.isNotNull(sleepingRow.wakeAt);
      assert.isNotNull(sleepingRow.pendingCorrelationId);
      assert.isNull(sleepingRow.pendingThreadId); // a timer has no thread
      assert.isNull(sleepingRow.pendingKind);

      const journalBefore = yield* Effect.promise(() => store.readEntries(runId));
      assert.isTrue(
        [...journalBefore.bySeq.values()].some(
          (entry) => entry.kind === "wait.until" && entry.phase === "sent",
        ),
        "a wait.until sent entry is journaled",
      );
      assert.strictEqual(journalBefore.byCorrelation.size, 0); // not yet resolved

      const deadlineMs = DateTime.makeUnsafe(sleepingRow.wakeAt!).epochMilliseconds;

      // ── Simulate restart: throw away the in-memory registry + scheduler, rebuild from DB ──
      const completed: Array<Record<string, unknown>> = [];
      const registry = yield* rebuildSleepingFromDb(repo, store, completed);

      // Arm a FRESH scheduler purely from the DB. Clock starts 1s before the deadline.
      const manual = makeManualClock(deadlineMs - 1000);
      const scheduler = makeWorkflowScheduler({
        listSleeping: () =>
          Effect.runPromise(repo.listByStatus({ status: "sleeping" })).then((rows) =>
            rows
              .map(toSchedulerSleepingRun)
              .filter((run): run is NonNullable<typeof run> => run !== undefined),
          ),
        resume: (rid, correlationId) => {
          const run = registry.getRun(rid);
          return run === undefined ? Promise.resolve() : run.resume(correlationId, {});
        },
        clock: manual.clock,
      });

      yield* Effect.promise(() => scheduler.rearm());
      // The single timer is armed for the soonest deadline: 1s out.
      assert.strictEqual(manual.armedDelay(), 1000);
      assert.isUndefined(completed[0]); // not fired yet

      // Reach the deadline and let the timer fire → resume → replay past waitUntil → complete.
      manual.setNow(deadlineMs);
      yield* Effect.promise(() => manual.fire());

      // ── Completed from the DB-backed journal, with the validated result ──
      assert.deepStrictEqual(completed[0], { slept: true, deadline: deadlineMs });
      // Determinism: the resumed body re-read the journaled now(), so its deadline == recorded wake_at.
      const finalRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(finalRow.status, "completed");
      assert.isNull(finalRow.wakeAt); // cleared on wake
      assert.isNull(finalRow.pendingCorrelationId);
      assert.isUndefined(registry.getRun(runId)); // completed runs are unregistered
      assert.isFalse(manual.armedDelay() !== undefined); // no timer remains
      assert.isFalse(NodeFS.existsSync(NodePath.join(runsRoot, runId))); // NO local-disk journal
    }),
  );

  it.effect("a deadline that passed during downtime fires immediately on the boot arm", () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const store = yield* WorkflowJournalStore;
      const runId = "sleep-pastdue";

      yield* launchTimer(repo, store, runId, HOUR_MS);
      const sleepingRow = Option.getOrThrow(yield* repo.getById({ runId }));
      const deadlineMs = DateTime.makeUnsafe(sleepingRow.wakeAt!).epochMilliseconds;

      const completed: Array<Record<string, unknown>> = [];
      const registry = yield* rebuildSleepingFromDb(repo, store, completed);

      // The clock is already PAST the deadline (downtime longer than the timer).
      const manual = makeManualClock(deadlineMs + 5000);
      const scheduler = makeWorkflowScheduler({
        listSleeping: () =>
          Effect.runPromise(repo.listByStatus({ status: "sleeping" })).then((rows) =>
            rows
              .map(toSchedulerSleepingRun)
              .filter((run): run is NonNullable<typeof run> => run !== undefined),
          ),
        resume: (rid, correlationId) => {
          const run = registry.getRun(rid);
          return run === undefined ? Promise.resolve() : run.resume(correlationId, {});
        },
        clock: manual.clock,
      });

      yield* Effect.promise(() => scheduler.rearm());
      assert.strictEqual(manual.armedDelay(), 0); // past-due → 0ms, fires on the next tick
      yield* Effect.promise(() => manual.fire());

      assert.deepStrictEqual(completed[0], { slept: true, deadline: deadlineMs });
      assert.strictEqual(Option.getOrThrow(yield* repo.getById({ runId })).status, "completed");
    }),
  );
});
