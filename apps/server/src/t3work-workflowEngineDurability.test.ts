// @effect-diagnostics nodeBuiltinImport:off - durability test reads a workflow fixture + temp dir.
/**
 * Durability acceptance (Epic 25 §Open question 2). The whole point: a run parked on a
 * multi-hour ask survives a server restart because BOTH its replay journal (SqliteJournalStore)
 * and its run record (WorkflowRunRepository) live in SQLite — never on local disk.
 *
 * Each test launches the example recipe (agent in an isolated thread → thread.askUser in the
 * launching thread) through the REAL launch path with the DB-backed store + lifecycle, asserts
 * the DB holds a `suspended` row + journal rows, then DISCARDS the in-memory registry to
 * simulate a restart. It rebuilds the resume closures purely from the DB — playing boot
 * rehydration's role via the same `createWorkflowRunController` + `makeWorkflowRunLifecycle` the
 * production loop uses — and delivers replies through the registry (the reactor's role), until
 * the run completes with the schema-validated result. Test 1 restarts at the `askUser`
 * suspension; test 2 restarts at the `agent()` sub-thread suspension. No `.t3work-runs/` journal
 * is ever written.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { assert, it } from "@effect/vitest";
import { type OrchestrationCommand, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import type { JournalStore } from "@t3work/sdk";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterAll } from "vite-plus/test";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowJournalStoreLive } from "./persistence/Layers/SqliteJournalStore.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import {
  type WorkflowRun,
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

const workflowPath = fileURLToPath(
  new URL("../__fixtures__/t3work-exampleReview.workflow.ts", import.meta.url),
);
const runsRoot = mkdtempSync(join(tmpdir(), "t3work-durable-"));
afterAll(() => rmSync(runsRoot, { recursive: true, force: true }));

const projectId = ProjectId.make("proj-durable");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const nowIso = (): string => "2026-06-08T00:00:00.000Z";
const noopDispatch = (_command: OrchestrationCommand): Promise<void> => Promise.resolve();

const durabilityLayer = it.layer(
  Layer.mergeAll(
    WorkflowRunRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    WorkflowJournalStoreLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    SqlitePersistenceMemory,
  ),
);

durabilityLayer("workflow durability — DB-backed suspend survives a restart", (it) => {
  it.effect("resumes a run suspended on askUser across a simulated restart and completes", () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const store = yield* WorkflowJournalStore;

      const runId = "durable-askuser";
      const launchThreadId = "launch-askuser";
      const args = { prTitle: "Fix the billing rounding bug" };
      const dispatched: OrchestrationCommand[] = [];
      const dispatch = (command: OrchestrationCommand): Promise<void> => {
        dispatched.push(command);
        return Promise.resolve();
      };
      let seq = 0;
      const newId = (): string => `id-${(seq += 1)}`;

      // ── Launch: parks on the agent's isolated-thread turn ──────────────────
      const registry = makeWorkflowEngineRegistry();
      const launchLifecycle = makeWorkflowRunLifecycle({
        repo,
        row: buildRunningWorkflowRunRow({
          runId,
          workflowPath,
          args,
          launchThreadId,
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          nowIso: nowIso(),
        }),
        nowIso,
      });
      const launched = yield* Effect.promise(() =>
        launchWorkflowRecipe({
          runId,
          workflowPath,
          args,
          runsRoot,
          launchThreadId,
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          registry,
          dispatch,
          newId,
          nowIso,
          store,
          lifecycle: launchLifecycle,
        }),
      );
      assert.strictEqual(launched.status, "suspended");

      // Resume the agent turn IN-PROCESS (this uptime), so the run advances to the askUser.
      const agentAsk = registry.takePending(`${runId}:1`);
      assert.strictEqual(agentAsk?.kind, "thread.turn");
      yield* Effect.promise(() =>
        registry
          .getRun(runId)!
          .resume(agentAsk!.correlationId, { summary: "Low risk; well tested." }),
      );

      // ── DB now holds a suspended run parked on the user escalation + journal rows ──
      const suspendedRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(suspendedRow.status, "suspended");
      assert.strictEqual(suspendedRow.pendingThreadId, launchThreadId);
      assert.strictEqual(suspendedRow.pendingKind, "user.input");
      assert.isNotNull(suspendedRow.pendingCorrelationId);

      const journalBefore = yield* Effect.promise(() => store.readEntries(runId));
      // agent() = thread.create + thread.turn (resolved), askUser = user.input (sent, unresolved).
      assert.isAbove(journalBefore.bySeq.size, 0);
      assert.strictEqual(journalBefore.byCorrelation.size, 1); // only the agent turn resolved so far

      // ── Simulate restart: throw away the in-memory registry, rebuild from the DB ──
      const completed: Array<Record<string, unknown>> = [];
      const restarted = yield* rebuildFromDb(repo, store, dispatch, newId, (output) => {
        completed.push(output as Record<string, unknown>);
        return Promise.resolve();
      });

      const userAsk = restarted.takePending(launchThreadId);
      assert.strictEqual(userAsk?.kind, "user.input");
      assert.strictEqual(userAsk?.correlationId, suspendedRow.pendingCorrelationId);
      yield* Effect.promise(() =>
        restarted.getRun(runId)!.resume(userAsk!.correlationId, { merge: true }),
      );

      // ── Completed from the DB-backed journal, with the validated result ──
      assert.deepStrictEqual(completed[0], {
        summary: "Low risk; well tested.",
        merged: true,
      });
      const finalRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(finalRow.status, "completed");
      assert.isNull(finalRow.pendingCorrelationId);
      assert.isUndefined(restarted.getRun(runId)); // completed runs are unregistered
      assert.isFalse(existsSync(join(runsRoot, runId))); // NO local-disk journal
    }),
  );

  it.effect("resumes a run suspended on an agent() sub-thread across a simulated restart", () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const store = yield* WorkflowJournalStore;

      const runId = "durable-agent";
      const launchThreadId = "launch-agent";
      const args = { prTitle: "Tighten the retry backoff" };
      const dispatch = noopDispatch;
      let seq = 0;
      const newId = (): string => `id-${(seq += 1)}`;

      const registry = makeWorkflowEngineRegistry();
      const launched = yield* Effect.promise(() =>
        launchWorkflowRecipe({
          runId,
          workflowPath,
          args,
          runsRoot,
          launchThreadId,
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          registry,
          dispatch,
          newId,
          nowIso,
          store,
          lifecycle: makeWorkflowRunLifecycle({
            repo,
            row: buildRunningWorkflowRunRow({
              runId,
              workflowPath,
              args,
              launchThreadId,
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
      assert.strictEqual(launched.status, "suspended");

      // Parked on the agent's turn — which runs in the SPAWNED thread (`${runId}:1`), not the
      // launch thread. The DB must record that thread so rehydration restores the right pending.
      const row = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(row.status, "suspended");
      assert.strictEqual(row.pendingThreadId, `${runId}:1`);
      assert.strictEqual(row.pendingKind, "thread.turn");

      // ── Restart BEFORE resolving the agent turn: rebuild from the DB ──
      const completed: Array<Record<string, unknown>> = [];
      const restarted = yield* rebuildFromDb(repo, store, dispatch, newId, (output) => {
        completed.push(output as Record<string, unknown>);
        return Promise.resolve();
      });

      // Deliver the agent reply through the rebuilt closure → advances to askUser.
      const agentAsk = restarted.takePending(`${runId}:1`);
      assert.strictEqual(agentAsk?.kind, "thread.turn");
      yield* Effect.promise(() =>
        restarted
          .getRun(runId)!
          .resume(agentAsk!.correlationId, { summary: "Backoff looks safe." }),
      );

      // The run re-suspended on askUser (in this uptime); resolve it to completion.
      const userAsk = restarted.takePending(launchThreadId);
      assert.strictEqual(userAsk?.kind, "user.input");
      yield* Effect.promise(() =>
        restarted.getRun(runId)!.resume(userAsk!.correlationId, { merge: false }),
      );

      assert.deepStrictEqual(completed[0], { summary: "Backoff looks safe.", merged: false });
      assert.strictEqual(Option.getOrThrow(yield* repo.getById({ runId })).status, "completed");
      assert.isFalse(existsSync(join(runsRoot, runId)));
    }),
  );
});

/**
 * Play boot rehydration's role: read every `suspended` run from the DB and rebuild its resume
 * closure into a FRESH registry using the production builders, restoring the pending ask. This
 * is `rehydrateSuspendedWorkflowRuns` minus the orchestration/config resolution, with the
 * test's dispatch + an `onComplete` sink so the completed result can be asserted.
 */
const rebuildFromDb = (
  repo: WorkflowRunRepositoryShape,
  store: JournalStore,
  dispatch: (command: OrchestrationCommand) => Promise<void>,
  newId: () => string,
  onComplete: (output: unknown) => Promise<void>,
) =>
  Effect.gen(function* () {
    const registry = makeWorkflowEngineRegistry();
    const rows: ReadonlyArray<WorkflowRun> = yield* repo.listByStatus({ status: "suspended" });
    for (const row of rows) {
      if (
        row.pendingThreadId === null ||
        row.pendingCorrelationId === null ||
        row.pendingKind === null
      ) {
        continue;
      }
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
        dispatch,
        newId,
        nowIso,
        store,
        lifecycle: makeWorkflowRunLifecycle({ repo, row, nowIso }),
        onComplete,
      });
      registry.setPending(row.pendingThreadId, {
        runId: row.runId,
        correlationId: row.pendingCorrelationId,
        kind: row.pendingKind,
      });
    }
    return registry;
  });
