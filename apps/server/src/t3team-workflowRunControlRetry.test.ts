// @effect-diagnostics nodeBuiltinImport:off - integration test writes an ephemeral workflow source + temp dir.
/**
 * Failed-run retry (GHE #344) — the `resume` branch of the shared control sequence for a
 * terminal-failed run, surfaced over the workflow card's control route:
 *
 *   • Guards: no retry deps → "not available"; no journal → "relaunch"; a retained failed
 *     `thread.turn` without a live turn re-drive → "not available" (the row must stay untouched);
 *     a second concurrent retry loses the CAS admission lock → reported, not double-driven.
 *   • Retained failed turn (GHE #403): re-issues the step's ask and parks the row `suspended`.
 *   • Detached replay: claims the run `running` and re-drives `resumeWorkflow` same-prefix.
 *   • Wiring: `controlWorkflowRun` routes `resume` on a failed run into this branch.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import { afterAll } from "vite-plus/test";

import { ServerConfig } from "./config.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowJournalStoreLive } from "./persistence/Layers/SqliteJournalStore.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { type WorkflowRun, WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3team-workflowEngineDurability.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import {
  makeWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistryLive,
} from "./t3team-workflowEngineRegistry.ts";
import {
  T3TeamWorkflowScheduler,
  T3TeamWorkflowSchedulerLive,
} from "./t3team-workflowScheduler.ts";
import { controlWorkflowRun, type WorkflowRunControlDeps } from "./t3team-workflowRunControl.ts";
import { retryFailedWorkflowRun } from "./t3team-workflowRunControlRetry.ts";

const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-run-control-retry-"));
afterAll(() => NodeFS.rmSync(cwd, { recursive: true, force: true }));

const projectId = ProjectId.make("proj-run-control-retry");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const threadId = ThreadId.make("run-control-retry-thread");
const nowIso = (): string => "2026-07-21T00:00:00.000Z";

const failingSource = `import { Schema } from "effect";
export const Inputs = Schema.Struct({});
export const Outputs = Schema.Struct({ stamp: Schema.Number });
export const meta = { name: "run-control-retry.fixture", inputs: Inputs, outputs: Outputs } as const;
const stamp = Date.now();
throw new Error("boom before completion");
`;

const correctedSource = `import { Schema } from "effect";
export const Inputs = Schema.Struct({});
export const Outputs = Schema.Struct({ stamp: Schema.Number });
export const meta = { name: "run-control-retry.fixture", inputs: Inputs, outputs: Outputs } as const;
const stamp = Date.now();
return { stamp };
`;

// ---------------------------------------------------------------------------
// Guard tests — pure fakes, no layers.
// ---------------------------------------------------------------------------

const fakeRow = (overrides: Partial<WorkflowRun> = {}): WorkflowRun => ({
  ...buildRunningWorkflowRunRow({
    runId: "run-guard",
    workflowPath: NodePath.join(cwd, ".t3team-runs", "run-guard", "workflow.ts"),
    args: {},
    launchThreadId: "thread-1",
    projectId,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    origin: "ephemeral",
    nowIso: nowIso(),
  }),
  ...overrides,
});

const fakeControlDeps = (
  overrides: Partial<WorkflowRunControlDeps> = {},
): WorkflowRunControlDeps => ({
  repo: {} as never,
  registry: {} as never,
  rearmScheduler: () => Promise.resolve(),
  dispatch: () => Effect.succeed(null),
  nowIso,
  stopOrigin: "user",
  ...overrides,
});

it.effect("refuses retry when the runtime has no retry deps (agent pause/stop tools)", () =>
  Effect.gen(function* () {
    const error = yield* retryFailedWorkflowRun(
      fakeControlDeps(),
      fakeRow({ status: "failed" }),
      "thread-1",
    ).pipe(Effect.flip);
    assert.match(error, /Retry of failed runs is not available/);
  }),
);

it.effect("refuses retry without touching the row when the run has no journal (GHE #344)", () =>
  Effect.gen(function* () {
    const error = yield* retryFailedWorkflowRun(
      fakeControlDeps({
        retryFailed: {
          journalStore: { hasRun: async () => false } as never,
          loadThreadProject: () => Effect.succeed({ project: { workspaceRoot: cwd } }),
        },
      }),
      fakeRow({ status: "failed" }),
      "thread-1",
    ).pipe(Effect.flip);
    assert.match(error, /no journal to resume from/);
  }),
);

it.effect(
  "refuses retry of a retained failed agent step without a live turn re-drive (GHE #403)",
  () =>
    Effect.gen(function* () {
      const error = yield* retryFailedWorkflowRun(
        fakeControlDeps({
          retryFailed: {
            journalStore: { hasRun: async () => true } as never,
            loadThreadProject: () => Effect.succeed({ project: { workspaceRoot: cwd } }),
          },
        }),
        fakeRow({
          status: "failed",
          pendingKind: "thread.turn",
          pendingThreadId: "thread-1",
          pendingCorrelationId: "corr-1",
        }),
        "thread-1",
      ).pipe(Effect.flip);
      assert.match(error, /Re-driving a failed agent step is not available/);
    }),
);

it.effect(
  "a second concurrent retry loses the CAS admission lock and is reported, not double-driven",
  () =>
    Effect.gen(function* () {
      const repo = {
        casSetStatus: () => Effect.succeed(false),
        setStatus: () => Effect.void,
        getById: () => Effect.succeed(Option.some(fakeRow({ status: "running" }))),
      };
      const error = yield* retryFailedWorkflowRun(
        fakeControlDeps({
          repo: repo as never,
          registry: {} as never,
          retryFailed: {
            journalStore: { hasRun: async () => true } as never,
            loadThreadProject: () => Effect.succeed({ project: { workspaceRoot: cwd } }),
          },
        }),
        fakeRow({ status: "failed" }),
        "thread-1",
      ).pipe(Effect.flip);
      assert.match(error, /already finished \(running\)/);
    }),
);

it.effect(
  "a concurrent stop that wins while the re-drive fails survives the rollback (GHE #344 review)",
  () =>
    Effect.gen(function* () {
      // State-machine CAS repo: a write applies only when the row is still in the expected state.
      // Deterministic interleaving — the moment the admission CAS claims "running", the user's
      // Stop CAS lands and wins (exactly the race the blind setStatus(failed) rollback would
      // clobber by overwriting the terminal "cancelled").
      const writes: Array<string> = [];
      let status = "failed";
      const applyCas = (input: { status: string; expectedStatuses: readonly string[] }) => {
        if (!input.expectedStatuses.includes(status)) return false;
        status = input.status;
        writes.push(input.status);
        if (input.status === "running") {
          status = "cancelled"; // the concurrent stop, right after admission
          writes.push("cancelled (concurrent stop)");
        }
        return true;
      };
      const repo = {
        casSetStatus: (input: { status: string; expectedStatuses: readonly string[] }) =>
          Effect.succeed(applyCas(input)),
        setStatus: () => Effect.fail("the rollback must not be a blind write"),
        setTurnRetries: () => Effect.void,
        getById: () => Effect.succeed(Option.some(fakeRow({ status: "cancelled" }))),
      };
      const error = yield* retryFailedWorkflowRun(
        fakeControlDeps({
          repo: repo as never,
          registry: {
            getRun: () => undefined,
            registerRun: () => undefined,
            registerOwnership: () => undefined,
            deleteRun: () => undefined,
            setPending: () => undefined,
            peekPending: () => undefined,
          } as never,
          retryFailed: {
            journalStore: { hasRun: async () => true } as never,
            path: {
              resolve: (p: string) => p,
              join: (...parts: string[]) => parts.join("/"),
            } as never,
            // Drive dies AFTER admission, while the row is already "cancelled" — the re-drive
            // never gets to park anything or detach a replay.
            loadThreadProject: () => Effect.fail("project lookup exploded"),
          },
        }),
        fakeRow({ status: "failed" }),
        "thread-1",
      ).pipe(Effect.flip);
      assert.strictEqual(error, "project lookup exploded");
      // The terminal stop survived: the rollback saw the row was no longer "running", wrote
      // nothing, and the real settle is intact.
      assert.strictEqual(status, "cancelled");
      assert.deepStrictEqual(writes, ["running", "cancelled (concurrent stop)"]);
    }),
);

it.effect(
  "a retained re-issue that dies after parking leaves the row suspended, never a blind overwrite",
  () =>
    Effect.gen(function* () {
      const writes: Array<string> = [];
      let status = "failed";
      const repo = {
        casSetStatus: (input: { status: string; expectedStatuses: readonly string[] }) =>
          Effect.sync(() => {
            if (!input.expectedStatuses.includes(status)) return false;
            status = input.status;
            writes.push(input.status);
            return true;
          }),
        setStatus: () => Effect.fail("the rollback must not be a blind write"),
        setTurnRetries: () => Effect.void,
        setPending: () =>
          Effect.sync(() => {
            status = "suspended";
            writes.push("suspended (parked)");
          }),
        getById: () => Effect.succeed(Option.some(fakeRow({ status: "suspended" }))),
      };
      const error = yield* retryFailedWorkflowRun(
        fakeControlDeps({
          repo: repo as never,
          registry: {
            getRun: () => undefined,
            registerRun: () => undefined,
            registerOwnership: () => undefined,
            deleteRun: () => undefined,
            setPending: () => undefined,
            peekPending: () => undefined,
          } as never,
          turnRedrive: {
            processTurnRetry: () => Effect.fail("turn re-issue lost the race"),
            settleNoText: () => Effect.void,
            settleFailedTurn: () => Effect.void,
          } as never,
          retryFailed: {
            journalStore: { hasRun: async () => true } as never,
            path: {
              resolve: (p: string) => p,
              join: (...parts: string[]) => parts.join("/"),
            } as never,
            loadThreadProject: () => Effect.succeed({ project: { workspaceRoot: cwd } }),
          },
        }),
        fakeRow({
          status: "failed",
          pendingKind: "thread.turn",
          pendingThreadId: "thread-1",
          pendingCorrelationId: "corr-1",
        }),
        "thread-1",
      ).pipe(Effect.flip);
      assert.strictEqual(error, "turn re-issue lost the race");
      // The re-issue parked the ask first; the rollback's CAS (expected "running") misses the
      // "suspended" row and leaves the parked affordance intact — no overwrite, no phantom.
      assert.strictEqual(status, "suspended");
      assert.deepStrictEqual(writes, ["running", "suspended (parked)"]);
    }),
);

// ---------------------------------------------------------------------------
// Integration tests — real engine + real SQLite journal (mirrors
// t3team-toolBrokerWorkflowResumeTool.test.ts).
// ---------------------------------------------------------------------------

const stubEngine: OrchestrationEngineShape = {
  readEvents: () => Stream.empty,
  dispatch: () => Effect.succeed({ sequence: 0 }),
  streamDomainEvents: Stream.never,
  subscribeDomainEvents: Effect.acquireRelease(Effect.succeed(Stream.empty), () => Effect.void),
  latestSequence: Effect.succeed(0),
};
const OrchestrationEngineTestLive = Layer.succeed(OrchestrationEngineService, stubEngine);

const WorkflowEngineDurabilityTestLive = T3TeamWorkflowSchedulerLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      T3TeamWorkflowEngineRegistryLive,
      WorkflowRunRepositoryLive,
      WorkflowJournalStoreLive,
    ),
  ),
  Layer.provide(SqlitePersistenceMemory),
);

const TestLayer = Layer.mergeAll(
  WorkflowEngineDurabilityTestLive,
  OrchestrationEngineTestLive,
  ServerConfig.layerTest(cwd, { prefix: "t3-run-control-retry-test-" }),
).pipe(Layer.provideMerge(NodeServices.layer));

/** Real layer services, card-route wiring, stubbed thread→project resolution. */
const makeCardControlDeps = Effect.gen(function* () {
  const scheduler = yield* T3TeamWorkflowScheduler;
  const registry = yield* T3TeamWorkflowEngineRegistry;
  const repo = yield* WorkflowRunRepository;
  return {
    deps: {
      repo,
      registry,
      rearmScheduler: () => scheduler.rearm(),
      dispatch: () => Effect.succeed(null),
      nowIso,
      stopOrigin: "user" as const,
      // Fake turn re-drive: the re-issued ask is recorded, nothing else happens (the test then
      // asserts the durable row, which is the observable outcome).
      turnRedrive: {
        processTurnRetry: () => Effect.void,
        settleNoText: () => Effect.void,
        settleFailedTurn: () => Effect.void,
      } as never,
      retryFailed: {
        journalStore: yield* WorkflowJournalStore,
        fileSystem: yield* FileSystem.FileSystem,
        path: yield* Path.Path,
        loadThreadProject: () => Effect.succeed({ project: { workspaceRoot: cwd } }),
      },
    },
  };
});

it.live(
  "retry of a retained failed agent turn re-issues the step and parks the row suspended",
  () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const store = yield* WorkflowJournalStore;
      const registry = yield* T3TeamWorkflowEngineRegistry;
      const { deps } = yield* makeCardControlDeps;
      const runId = "retry-retained-turn";
      // A host-detected step failure always has a journal (the step's `sent` entry); seed the
      // precondition so the retry's journal guard passes.
      yield* Effect.promise(() =>
        store.writeRunMeta(runId, {
          workflowPath: NodePath.join(cwd, ".t3team-runs", runId, "workflow.ts"),
          argsHash: "hash",
          createdAt: nowIso(),
        }),
      );
      const failedRow: WorkflowRun = {
        ...fakeRow({ runId }),
        status: "failed",
        pendingKind: "thread.turn",
        pendingThreadId: "step-thread-1",
        pendingCorrelationId: `${runId}:1`,
        failureReason: "agent turn ended without a reply",
        failureStep: "resume: thread.turn (QA round 1)",
      };
      yield* repo.upsert(failedRow);

      const value = yield* controlWorkflowRun(deps, failedRow, {
        threadId: "thread-1",
        action: "resume",
      });
      assert.strictEqual(value.status, "suspended");

      // The row is re-parked on the SAME ask with a fresh re-drive budget — the run can settle
      // itself again when the re-driven turn answers.
      const row = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(row.status, "suspended");
      assert.strictEqual(row.pendingCorrelationId, `${runId}:1`);
      assert.strictEqual(registry.peekPending("step-thread-1")?.runId, runId);
    }).pipe(Effect.provide(TestLayer)),
);

it.live(
  "retry of a body-thrown failure claims the run running and re-drives the journal replay",
  () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const store = yield* WorkflowJournalStore;
      const { deps } = yield* makeCardControlDeps;
      const runId = "retry-detached-replay";
      const runDir = NodePath.join(cwd, ".t3team-runs", runId);
      const workflowPath = NodePath.join(runDir, "workflow.ts");
      NodeFS.mkdirSync(runDir, { recursive: true });
      NodeFS.writeFileSync(workflowPath, failingSource);

      // Launch through the real engine so the journal records the pre-failure prefix.
      const throwaway = makeWorkflowEngineRegistry();
      let seq = 0;
      const launched = yield* Effect.promise(() =>
        launchWorkflowRecipe({
          runId,
          workflowPath,
          args: {},
          runsRoot: NodePath.join(cwd, ".t3team-runs"),
          launchThreadId: "thread-1",
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          registry: throwaway,
          dispatch: () => Promise.resolve(),
          newId: () => `id-${(seq += 1)}`,
          nowIso,
          store,
          lifecycle: makeWorkflowRunLifecycle({
            repo,
            row: { ...fakeRow({ runId }), workflowPath },
            nowIso,
          }),
        }),
      );
      assert.strictEqual(launched.status, "failed");

      const row = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(row.status, "failed");

      // Corrected tail: the same-prefix replay re-draws the journaled Date.now() and completes.
      NodeFS.writeFileSync(workflowPath, correctedSource);

      // The card's retry goes through the SHARED control sequence (route → controlWorkflowRun).
      const value = yield* controlWorkflowRun(deps, row, {
        threadId: "thread-1",
        action: "resume",
      });
      assert.strictEqual(value.status, "running");

      // The re-drive runs detached; the durable row is the observable outcome — it must leave
      // `failed` and the replay must settle `completed` on the corrected source.
      yield* Effect.gen(function* () {
        for (let i = 0; i < 400; i += 1) {
          const fresh = Option.getOrThrow(yield* repo.getById({ runId }));
          if (fresh.status === "completed") return;
          yield* Effect.sleep(Duration.millis(25));
        }
        return yield* Effect.die(new Error("timed out waiting for retried run to complete"));
      });
    }).pipe(Effect.provide(TestLayer)),
);
