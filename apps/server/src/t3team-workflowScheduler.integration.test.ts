/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
// @effect-diagnostics nodeBuiltinImport:off - scheduler durability test reads a workflow fixture + temp dir.
/**
 * Scheduler durability acceptance (Epic 27 §The scheduler service — the load-bearing slice).
 * The whole point: a run parked on `waitUntil` survives a server restart because BOTH its replay
 * journal (SqliteJournalStore) and its run record (`workflow_runs`, status `sleeping` + `wake_at`)
 * live in SQLite, and a scheduler sweep — reading the DB on every tick — wakes it on the wall
 * clock with NO manual resume.
 *
 * Each test launches the timer recipe (`now()` → `waitUntil(deadline)`) through the REAL launch
 * path with the DB-backed store + lifecycle, asserts the DB holds a `sleeping` row + `wake_at` +
 * a `wait.until` sent journal entry, then DISCARDS the in-memory registry AND scheduler to
 * simulate a restart. It rebuilds the resume closures purely from the DB (boot rehydration's
 * role) and opens a FRESH sweep over the DB's `wake_at` (the scheduler's role) — driven by an
 * injected clock, with each `runDue` standing in for one upstream `Scheduler` tick — until the
 * run completes with the schema-validated result. A past-due deadline wakes on the catch-up pass
 * `rearm` starts (the downtime guarantee).
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { appendResolvedEntry } from "@t3team/sdk";
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
} from "./t3team-workflowEngineDurability.ts";
import {
  createWorkflowRunController,
  launchWorkflowRecipe,
} from "./t3team-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";
import { makeWorkflowScheduler, toSchedulerSleepingRun } from "./t3team-workflowScheduler.ts";
import { makeSchedulerResume, orphanSleepingRun } from "./t3team-workflowSchedulerResume.ts";
import { workflowControlValidationError } from "./t3team-workflowRunControl.ts";

const workflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3team-exampleTimer.workflow.ts", import.meta.url),
);
const waitWorkflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3team-exampleWaitTimer.workflow.ts", import.meta.url),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-scheduler-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const projectId = ProjectId.make("proj-scheduler");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const nowIso = (): string => "2026-06-08T00:00:00.000Z";
const noopHost = makeFakeWorkflowHost().host;

const HOUR_MS = 60 * 60 * 1000;

/** A mutable wall clock: a test moves it, then runs one due pass (one `Scheduler` tick). */
function makeManualClock(startMs: number): {
  readonly now: () => number;
  readonly setNow: (ms: number) => void;
} {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    setNow: (ms) => {
      nowMs = ms;
    },
  };
}

const listSleepingFrom = (repo: WorkflowRunRepositoryShape) => () =>
  Effect.runPromise(repo.listByStatus({ status: "sleeping" })).then((rows) =>
    rows
      .map(toSchedulerSleepingRun)
      .filter((run): run is NonNullable<typeof run> => run !== undefined),
  );

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
  store: import("@t3team/sdk").JournalStore,
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
        host: noopHost,
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
  store: import("@t3team/sdk").JournalStore,
  runId: string,
  delayMs: number,
  recipePath: string = workflowPath,
) =>
  Effect.gen(function* () {
    const args = { delayMs };
    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        runId,
        workflowPath: recipePath,
        args,
        runsRoot,
        launchThreadId: `launch-${runId}`,
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        registry: makeWorkflowEngineRegistry(),
        host: noopHost,
        newId: () => `${runId}-id`,
        nowIso,
        store,
        lifecycle: makeWorkflowRunLifecycle({
          repo,
          row: buildRunningWorkflowRunRow({
            runId,
            workflowPath: recipePath,
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
  it.effect("reads wake_at from the DB after a restart, wakes at the deadline, and resumes", () =>
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

      // Open a FRESH sweep purely over the DB. Clock starts 1s before the deadline.
      const manual = makeManualClock(deadlineMs - 1000);
      const scheduler = makeWorkflowScheduler({
        listSleeping: listSleepingFrom(repo),
        resume: (rid, correlationId) => {
          const run = registry.getRun(rid);
          return run === undefined ? Promise.resolve() : run.resume(correlationId, {});
        },
        now: manual.now,
      });

      // Boot: `rearm` opens the sweep; its catch-up pass (joined here) finds nothing due yet.
      yield* Effect.promise(() => scheduler.rearm());
      yield* Effect.promise(() => scheduler.runDue());
      assert.isUndefined(completed[0]); // not woken yet

      // Reach the deadline; the next tick resumes → replays past waitUntil → completes.
      manual.setNow(deadlineMs);
      yield* Effect.promise(() => scheduler.runDue());

      // ── Completed from the DB-backed journal, with the validated result ──
      assert.deepStrictEqual(completed[0], { slept: true, deadline: deadlineMs });
      // Determinism: the resumed body re-read the journaled now(), so its deadline == recorded wake_at.
      const finalRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(finalRow.status, "completed");
      assert.isNull(finalRow.wakeAt); // cleared on wake
      assert.isNull(finalRow.pendingCorrelationId);
      assert.isUndefined(registry.getRun(runId)); // completed runs are unregistered
      assert.isFalse(NodeFS.existsSync(NodePath.join(runsRoot, runId))); // NO local-disk journal
    }),
  );

  it.effect("a deadline that passed during downtime wakes on the boot catch-up pass", () =>
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
        listSleeping: listSleepingFrom(repo),
        resume: (rid, correlationId) => {
          const run = registry.getRun(rid);
          return run === undefined ? Promise.resolve() : run.resume(correlationId, {});
        },
        now: manual.now,
      });

      // `rearm` starts the catch-up pass itself; `runDue` joins it rather than starting another.
      yield* Effect.promise(() => scheduler.rearm());
      yield* Effect.promise(() => scheduler.runDue());

      assert.deepStrictEqual(completed[0], { slept: true, deadline: deadlineMs });
      assert.strictEqual(Option.getOrThrow(yield* repo.getById({ runId })).status, "completed");
    }),
  );
});

schedulerLayer("workflow scheduler — wait(ms) takes the same durable park", (it) => {
  it.effect("parks a relative wait as sleeping, accepts pause, and wakes after a restart", () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const store = yield* WorkflowJournalStore;
      const runId = "wait-parks";

      // Before the fix `wait(ms)` was an in-process timer: the run stayed `running` with no
      // `wake_at`, pause was refused, and boot rehydration FAILED it as interrupted.
      const launched = yield* launchTimer(repo, store, runId, HOUR_MS, waitWorkflowPath);
      assert.strictEqual(launched.status, "suspended");
      const sleepingRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(sleepingRow.status, "sleeping");
      assert.isNotNull(sleepingRow.wakeAt);
      assert.isNull(
        workflowControlValidationError(sleepingRow, {
          threadId: `launch-${runId}`,
          action: "pause",
        }),
      );
      const kinds = [...(yield* Effect.promise(() => store.readEntries(runId))).bySeq.values()].map(
        (entry) => entry.kind,
      );
      assert.includeMembers(kinds, ["wait", "wait.until"]);

      // Restart: only the DB survives; rehydration rebuilds the sleeping run, the sweep wakes it.
      const deadlineMs = DateTime.makeUnsafe(sleepingRow.wakeAt!).epochMilliseconds;
      const completed: Array<Record<string, unknown>> = [];
      const registry = yield* rebuildSleepingFromDb(repo, store, completed);
      const manual = makeManualClock(deadlineMs - 1000);
      const scheduler = makeWorkflowScheduler({
        listSleeping: listSleepingFrom(repo),
        resume: (rid, correlationId) => {
          const run = registry.getRun(rid);
          return run === undefined ? Promise.resolve() : run.resume(correlationId, {});
        },
        now: manual.now,
      });
      yield* Effect.promise(() => scheduler.rearm());
      yield* Effect.promise(() => scheduler.runDue());
      assert.isUndefined(completed[0]);

      manual.setNow(deadlineMs);
      yield* Effect.promise(() => scheduler.runDue());
      assert.deepStrictEqual(completed[0], { slept: true });
      assert.strictEqual(Option.getOrThrow(yield* repo.getById({ runId })).status, "completed");
    }),
  );
});

schedulerLayer("workflow scheduler — no-op resumes are orphaned, not hot-looped", (it) => {
  it.effect("a due row whose run is unregistered is orphaned, told, and never re-tried", () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const store = yield* WorkflowJournalStore;
      const runId = "sleep-orphan-unregistered";

      yield* launchTimer(repo, store, runId, HOUR_MS);
      const sleepingRow = Option.getOrThrow(yield* repo.getById({ runId }));
      const deadlineMs = DateTime.makeUnsafe(sleepingRow.wakeAt!).epochMilliseconds;

      // No rehydration: the run is NOT registered this uptime (recipe gone / rehydration failed).
      const registry = makeWorkflowEngineRegistry();
      // Clock is past the deadline, so the row is due on the first arm.
      const manual = makeManualClock(deadlineMs + 5000);
      const told: Array<{ launchThreadId: string | undefined; errorText: string }> = [];
      let reads = 0;
      const listSleeping = listSleepingFrom(repo);
      const scheduler = makeWorkflowScheduler({
        listSleeping: () => {
          reads += 1;
          return listSleeping();
        },
        resume: makeSchedulerResume({
          getRun: (rid) => registry.getRun(rid),
          orphan: (rid, correlationId) =>
            orphanSleepingRun(repo, rid, correlationId, (launchThreadId, errorText) => {
              told.push({ launchThreadId, errorText });
              return Promise.resolve();
            }),
        }),
        now: manual.now,
      });

      // One pass: resume finds no registered run → orphans the row and tells its launch thread.
      yield* Effect.promise(() => scheduler.rearm());
      yield* Effect.promise(() => scheduler.runDue());

      const orphaned = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(orphaned.status, "failed"); // excluded from future listSleeping
      assert.isNull(orphaned.wakeAt);
      assert.isNull(orphaned.pendingCorrelationId);
      assert.strictEqual(told.length, 1);
      assert.strictEqual(told[0]?.launchThreadId, `launch-${runId}`);
      // Bounded: the next tick finds nothing to wake and tells no one again.
      yield* Effect.promise(() => scheduler.runDue());
      assert.strictEqual(reads, 2);
      assert.strictEqual(told.length, 1);
    }),
  );

  it.effect(
    "a wrote:false wake (journaled pre-crash, never settled) is orphaned, not re-tried",
    () =>
      Effect.gen(function* () {
        const repo = yield* WorkflowRunRepository;
        const store = yield* WorkflowJournalStore;
        const runId = "sleep-orphan-wrote-false";

        yield* launchTimer(repo, store, runId, HOUR_MS);
        const sleepingRow = Option.getOrThrow(yield* repo.getById({ runId }));
        const deadlineMs = DateTime.makeUnsafe(sleepingRow.wakeAt!).epochMilliseconds;
        const correlationId = sleepingRow.pendingCorrelationId!;

        // Simulate the crash window: a prior process journaled the wake reply (resolved) but died
        // before settling, so the run row is still `sleeping`.
        const wroteFirst = yield* Effect.promise(() =>
          appendResolvedEntry({ store, runsRoot, runId, correlationId, reply: {} }),
        );
        assert.isTrue(wroteFirst); // the prior process's write succeeded

        // Restart: rebuild the resume closure from the DB (still sleeping) and open a fresh sweep.
        const completed: Array<Record<string, unknown>> = [];
        const registry = yield* rebuildSleepingFromDb(repo, store, completed);
        const manual = makeManualClock(deadlineMs);
        const scheduler = makeWorkflowScheduler({
          listSleeping: listSleepingFrom(repo),
          resume: makeSchedulerResume({
            getRun: (rid) => registry.getRun(rid),
            orphan: (rid, correlationId) => orphanSleepingRun(repo, rid, correlationId),
          }),
          now: manual.now,
        });

        // The pass resumes: appendResolvedEntry now returns wrote:false → orphanIfSleeping fails it.
        yield* Effect.promise(() => scheduler.rearm());
        yield* Effect.promise(() => scheduler.runDue());

        const orphaned = Option.getOrThrow(yield* repo.getById({ runId }));
        assert.strictEqual(orphaned.status, "failed"); // NOT re-armed, NOT falsely completed
        assert.isUndefined(completed[0]); // the workflow body never re-ran
        assert.isNull(orphaned.wakeAt);
      }),
  );
});

schedulerLayer("workflow scheduler — passes", (it) => {
  it.effect("admits every due run before waiting for a slow first settlement", () =>
    Effect.gen(function* () {
      const nowMs = DateTime.makeUnsafe(nowIso()).epochMilliseconds;
      let releaseFirst!: () => void;
      const first = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const calls: string[] = [];
      const scheduler = makeWorkflowScheduler({
        listSleeping: () =>
          Promise.resolve([
            { runId: "first", correlationId: "first:1", wakeAtMs: nowMs },
            { runId: "second", correlationId: "second:1", wakeAtMs: nowMs },
            { runId: "later", correlationId: "later:1", wakeAtMs: nowMs + 60_000 },
          ]),
        resume: (runId) => {
          calls.push(runId);
          return runId === "first" ? first : Promise.resolve();
        },
        now: () => nowMs,
      });

      yield* Effect.promise(() => scheduler.rearm());
      const passing = scheduler.runDue();
      yield* Effect.promise(() => Promise.resolve());
      // Both due runs entered before the first settled; the future deadline was left alone.
      assert.deepStrictEqual(calls, ["first", "second"]);
      releaseFirst();
      yield* Effect.promise(() => passing);
    }),
  );

  it.effect("stays shut until rearm, and a pass never overlaps itself", () =>
    Effect.gen(function* () {
      let reads = 0;
      let releaseRead!: () => void;
      const readBlocked = new Promise<void>((resolve) => {
        releaseRead = resolve;
      });
      const scheduler = makeWorkflowScheduler({
        listSleeping: async () => {
          reads += 1;
          await readBlocked;
          return [];
        },
        resume: () => Promise.resolve(),
      });

      // Before boot rehydration opens it, a tick reads nothing (a due row would look orphaned).
      yield* Effect.promise(() => scheduler.runDue());
      assert.strictEqual(reads, 0);

      // rearm starts the catch-up pass; ticks and later rearms while it runs join it.
      yield* Effect.promise(() => scheduler.rearm());
      const joined = scheduler.runDue();
      yield* Effect.promise(() => scheduler.rearm());
      yield* Effect.promise(() => Promise.resolve());
      assert.strictEqual(reads, 1);
      releaseRead();
      yield* Effect.promise(() => joined);

      // Once it settled, the next tick is a fresh pass.
      yield* Effect.promise(() => scheduler.runDue());
      assert.strictEqual(reads, 2);
    }),
  );
});
