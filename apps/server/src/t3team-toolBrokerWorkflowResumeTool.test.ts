// @effect-diagnostics nodeBuiltinImport:off - integration test writes an ephemeral workflow source + temp dir.
/**
 * `t3team.orchestration.resume` — the broker tool surfacing the engine's journal resume:
 *
 *   • Validation: missing/unknown runId, another thread's run (identical not-found answer,
 *     so run ids can't be probed across threads), a non-resumable status, and corrected
 *     source against a non-ephemeral (recipe) run.
 *   • Paused: restores the parked pending ask (mirroring the HTTP control route).
 *   • Failed + corrected source (the full round trip, real engine + real SQLite journal):
 *     an ephemeral run fails after a journaled step; replacing the source on disk and resuming
 *     without an inline source preserves the old T3Team behavior, re-drives `resumeWorkflow`
 *     — same-prefix replay — and the run completes.
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
import { afterAll } from "vite-plus/test";

import { ServerConfig } from "./config.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { WorkflowSignalStoreLive } from "./persistence/WorkflowSignalStore.ts";
import { WorkflowJournalStoreLive } from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepositoryLive } from "./persistence/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import { WorkflowSignalStore } from "./persistence/WorkflowSignalStore.ts";
import { makeWorkflowResumeToolHandlers } from "./t3team-toolBrokerWorkflowResumeTool.ts";
import type { WorkflowResumeToolDeps } from "./t3team-toolBrokerWorkflowResumeActions.ts";
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
  makeFakeWorkflowHost,
  makeFakeWorkflowHostLayer,
} from "./t3team-workflowHostFake.fixtures.ts";
import {
  T3TeamWorkflowScheduler,
  T3TeamWorkflowSchedulerLive,
} from "./t3team-workflowScheduler.ts";

const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-resume-tool-"));
afterAll(() => NodeFS.rmSync(cwd, { recursive: true, force: true }));

const projectId = ProjectId.make("proj-resume-tool");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const threadId = ThreadId.make("resume-tool-thread");
const nowIso = (): string => "2026-07-20T00:00:00.000Z";

// The resume path talks to orchestration only through the workflow host; a recording fake
// stands in for it (the handlers take it directly; the scheduler gate needs no host).
const fakeHost = makeFakeWorkflowHostLayer();

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
  fakeHost.layer,
  WorkflowSignalStoreLive.pipe(Layer.provide(SqlitePersistenceMemory)),
  ServerConfig.layerTest(cwd, { prefix: "t3-resume-tool-test-" }),
).pipe(Layer.provideMerge(NodeServices.layer));

/** Build the handler with real layer services and a stubbed thread→project resolution. */
const makeHandlers = Effect.gen(function* () {
  const scheduler = yield* T3TeamWorkflowScheduler;
  const deps: WorkflowResumeToolDeps = {
    fileSystem: yield* FileSystem.FileSystem,
    path: yield* Path.Path,
    runRepository: yield* WorkflowRunRepository,
    registry: yield* T3TeamWorkflowEngineRegistry,
    journalStore: yield* WorkflowJournalStore,
    rearmScheduler: () => scheduler.rearm(),
    host: fakeHost.host,
    loadThreadProject: () => Effect.succeed({ project: { workspaceRoot: cwd } }),
    signalStore: yield* WorkflowSignalStore,
  };
  return makeWorkflowResumeToolHandlers(deps)(threadId);
});

const baseRow = (
  runId: string,
  overrides: Partial<Parameters<typeof buildRunningWorkflowRunRow>[0]> = {},
) =>
  buildRunningWorkflowRunRow({
    runId,
    workflowPath: NodePath.join(cwd, ".t3team-runs", runId, "workflow.ts"),
    args: {},
    launchThreadId: String(threadId),
    projectId,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    origin: "ephemeral",
    nowIso: nowIso(),
    ...overrides,
  });

it.effect("rejects a missing runId, an unknown runId, and another thread's run identically", () =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const handlers = yield* makeHandlers;

    const missing = yield* handlers.resumeWorkflowRun({}).pipe(Effect.flip);
    assert.match(missing, /requires a runId/);

    const unknown = yield* handlers.resumeWorkflowRun({ runId: "nope" }).pipe(Effect.flip);
    assert.match(unknown, /No orchestration run found/);

    yield* repo.upsert({
      ...baseRow("other-thread-run"),
      status: "failed",
      launchThreadId: "someone-else",
    });
    const foreign = yield* handlers
      .resumeWorkflowRun({ runId: "other-thread-run" })
      .pipe(Effect.flip);
    assert.match(foreign, /No orchestration run found/);
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("rejects a run that is neither paused nor failed", () =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const handlers = yield* makeHandlers;
    yield* repo.upsert({ ...baseRow("completed-run"), status: "completed" });
    const error = yield* handlers.resumeWorkflowRun({ runId: "completed-run" }).pipe(Effect.flip);
    assert.match(error, /is completed; only a paused or failed run can be resumed/);
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("rejects corrected source for a run whose source is not ephemeral", () =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const handlers = yield* makeHandlers;
    yield* repo.upsert({
      ...baseRow("recipe-run", {
        workflowPath: NodePath.join(cwd, ".t3team", "recipes", "r1", "r1.workflow.ts"),
        origin: "recipe",
      }),
      status: "failed",
    });
    const error = yield* handlers
      .resumeWorkflowRun({
        runId: "recipe-run",
        source: 'export const meta = { name: "x" } as const;\nreturn {};',
      })
      .pipe(Effect.flip);
    assert.match(error, /only supported for ephemeral runs/);
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("paused: restores the parked pending ask into the registry", () =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const handlers = yield* makeHandlers;
    const runId = "paused-run";
    yield* repo.upsert({
      ...baseRow(runId),
      status: "paused",
      pendingThreadId: String(threadId),
      pendingCorrelationId: `${runId}:1`,
      pendingKind: "user.input",
    });
    // The controller a boot rehydration (or live launch) would have registered.
    registry.registerRun(runId, { resume: async () => {}, cancel: () => {} });

    const value = yield* handlers.resumeWorkflowRun({ runId });
    assert.strictEqual(value.status, "suspended");
    const pending = registry.peekPending(String(threadId));
    assert.strictEqual(pending?.runId, runId);
    assert.strictEqual(pending?.correlationId, `${runId}:1`);
    const row = Option.getOrThrow(yield* repo.getById({ runId }));
    assert.strictEqual(row.status, "suspended");
  }).pipe(Effect.provide(TestLayer)),
);

it.effect(
  "paused on a signal park: resume lands in watching and drains the bridged inbox event",
  () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const registry = yield* T3TeamWorkflowEngineRegistry;
      const signalStore = yield* WorkflowSignalStore;
      const handlers = yield* makeHandlers;
      const runId = "paused-signal-run";
      yield* repo.upsert(baseRow(runId));
      // Park the row on a signal event (design 42): clears the thread + timer columns, records
      // the awaited (signal, key) tuple and the park's correlation.
      yield* repo.setWatching({
        runId,
        correlationId: `${runId}:w`,
        watchSourceName: "scm.change-request.watch",
        watchParamsHash: "hash-1",
        watchSignalName: "scm.pull-request.merged",
        watchSignalKey: "42",
        updatedAt: nowIso(),
      });
      // Pause exactly the way the control route's CAS does.
      yield* repo.casSetStatus({
        runId,
        status: "paused",
        updatedAt: nowIso(),
        expectedStatuses: ["watching"],
      });
      // An event the delivery port bridged to the durable inbox while the run was paused.
      yield* signalStore.insertInboxEntry({
        sourceName: "scm.change-request.watch",
        paramsHash: "hash-1",
        signalName: "scm.pull-request.merged",
        key: "42",
        payload: { merged: true },
        createdAt: nowIso(),
      });
      // The controller a boot rehydration (or live launch) would have registered.
      const resumed: Array<{ correlationId: string; reply: unknown }> = [];
      registry.registerRun(runId, {
        resume: (correlationId, reply) => {
          resumed.push({ correlationId, reply });
          return Promise.resolve();
        },
        cancel: () => {},
      });

      const value = yield* handlers.resumeWorkflowRun({ runId });
      // The regression (GHE #332 re-review): this used to fail with
      // "Paused workflow has no continuation to resume." — a signal park has neither a pending
      // thread nor a wake_at, so neither old resume branch matched.
      assert.strictEqual(value.status, "watching");
      const row = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(row.status, "watching");
      // The bridged event was consumed and delivered to the parked correlation (first-wins: a
      // second take of the same tuple finds nothing).
      assert.deepStrictEqual(resumed, [{ correlationId: `${runId}:w`, reply: { merged: true } }]);
      assert.strictEqual(
        Option.isNone(
          yield* signalStore.takeOpenInboxEntry({
            sourceName: "scm.change-request.watch",
            paramsHash: "hash-1",
            signalName: "scm.pull-request.merged",
            key: "42",
            deliveredAt: nowIso(),
          }),
        ),
        true,
      );
    }).pipe(Effect.provide(TestLayer)),
);

const failingSource = `import { Schema } from "effect";
export const Inputs = Schema.Struct({});
export const Outputs = Schema.Struct({ stamp: Schema.Number });
export const meta = { name: "resume-tool.fixture", inputs: Inputs, outputs: Outputs } as const;
const stamp = Date.now();
throw new Error("boom before completion");
`;

// Same journaled prefix (the Date.now() draw replays), corrected tail.
const correctedSource = `import { Schema } from "effect";
export const Inputs = Schema.Struct({});
export const Outputs = Schema.Struct({ stamp: Schema.Number });
export const meta = { name: "resume-tool.fixture", inputs: Inputs, outputs: Outputs } as const;
const stamp = Date.now();
return { stamp };
`;

it.live(
  "failed + corrected source: re-drives the journal resume and the run completes (same-prefix replay)",
  () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const store = yield* WorkflowJournalStore;
      const handlers = yield* makeHandlers;
      const runId = "failed-ephemeral-run";
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
          launchThreadId: String(threadId),
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          registry: throwaway,
          host: makeFakeWorkflowHost().host,
          newId: () => `id-${(seq += 1)}`,
          nowIso,
          store,
          lifecycle: makeWorkflowRunLifecycle({
            repo,
            row: { ...baseRow(runId), workflowPath },
            nowIso,
          }),
        }),
      );
      assert.strictEqual(launched.status, "failed");
      assert.strictEqual(Option.getOrThrow(yield* repo.getById({ runId })).status, "failed");

      // The old T3Team route resumed the current file even when the caller did not provide an
      // inline replacement. This is the compatibility path that must remain accepted after the
      // generic engine gained optional content-version checks.
      NodeFS.writeFileSync(workflowPath, correctedSource);
      const value = yield* handlers.resumeWorkflowRun({ runId });
      assert.strictEqual(value.status, "accepted");

      // The re-drive runs detached; the durable row is the observable outcome.
      yield* Effect.gen(function* () {
        for (let i = 0; i < 200; i += 1) {
          const row = Option.getOrThrow(yield* repo.getById({ runId }));
          if (row.status === "completed") return;
          yield* Effect.sleep(Duration.millis(25));
        }
        return yield* Effect.die(new Error("timed out waiting for resumed run to complete"));
      });
    }).pipe(Effect.provide(TestLayer)),
);

// Review of fork #349: corrected source used to pass only the format precheck; the incident's
// unbound import would have been accepted here and died at the re-drive.
it.effect("refuses corrected source that fails the full check (unbound @t3team/sdk import)", () =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const handlers = yield* makeHandlers;
    const runId = "failed-bad-fix";
    const runDir = NodePath.join(cwd, ".t3team-runs", runId);
    NodeFS.mkdirSync(runDir, { recursive: true });
    NodeFS.writeFileSync(NodePath.join(runDir, "workflow.ts"), failingSource);
    yield* repo.upsert({ ...baseRow(runId), status: "failed" });

    const refused = yield* handlers
      .resumeWorkflowRun({
        runId,
        source: [
          `import { defineModelX } from "@t3team/sdk";`,
          `export const meta = { name: "resume-tool.fixture" } as const;`,
          `export default async function run() { return defineModelX({}); }`,
        ].join("\n"),
      })
      .pipe(Effect.result);
    assert.strictEqual(refused._tag, "Failure");
    if (refused._tag === "Failure") {
      assert.include(refused.failure, "defineModelX");
      assert.include(refused.failure, "[bindings]");
    }
    // Nothing was swapped in.
    assert.strictEqual(
      NodeFS.readFileSync(NodePath.join(runDir, "workflow.ts"), "utf8"),
      failingSource,
    );
  }).pipe(Effect.provide(TestLayer)),
);

// An input-contract fault is the one failure the CALLER can fix without touching source. The
// decision "re-run this run with these inputs" is the tool argument; the same run (same card)
// re-drives with the persisted correction. Before this, the description told agents to resume
// with corrected args while the schema only accepted a source (fork #350 review).
const inputsSource = `import { Schema } from "effect";
export const Inputs = Schema.Struct({ a: Schema.Number, b: Schema.Number });
export const Outputs = Schema.Struct({ sum: Schema.Number });
export const meta = { name: "resume-tool.inputs", inputs: Inputs, outputs: Outputs } as const;
const input = Schema.decodeSync(Inputs)(args);
return { sum: input.a + input.b };
`;

it.live("failed on invalid inputs + corrected args: the SAME run re-drives and completes", () =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const store = yield* WorkflowJournalStore;
    const handlers = yield* makeHandlers;
    const runId = "failed-inputs-run";
    const runDir = NodePath.join(cwd, ".t3team-runs", runId);
    const workflowPath = NodePath.join(runDir, "workflow.ts");
    NodeFS.mkdirSync(runDir, { recursive: true });
    NodeFS.writeFileSync(workflowPath, inputsSource);

    const throwaway = makeWorkflowEngineRegistry();
    let seq = 0;
    const badArgs = { a: "two", b: 3 };
    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        runId,
        workflowPath,
        args: badArgs,
        runsRoot: NodePath.join(cwd, ".t3team-runs"),
        launchThreadId: String(threadId),
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        registry: throwaway,
        host: makeFakeWorkflowHost().host,
        newId: () => `inputs-${(seq += 1)}`,
        nowIso,
        store,
        lifecycle: makeWorkflowRunLifecycle({
          repo,
          row: baseRow(runId, { args: badArgs }),
          nowIso,
        }),
      }),
    );
    assert.strictEqual(launched.status, "failed");
    const failedRow = Option.getOrThrow(yield* repo.getById({ runId }));
    assert.strictEqual(failedRow.status, "failed");
    assert.include(failedRow.failureReason ?? "", "Invalid inputs");

    const value = yield* handlers.resumeWorkflowRun({ runId, args: { a: 2, b: 3 } });
    assert.strictEqual(value.status, "accepted");
    // The correction is durable on the row before the re-drive reads it.
    assert.deepStrictEqual(Option.getOrThrow(yield* repo.getById({ runId })).args, { a: 2, b: 3 });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const row = Option.getOrThrow(yield* repo.getById({ runId }));
      if (row.status === "completed") break;
      yield* Effect.sleep(Duration.millis(10));
    }
    const finalRow = Option.getOrThrow(yield* repo.getById({ runId }));
    assert.strictEqual(`${finalRow.status}:${finalRow.failureReason ?? ""}`, "completed:");

    // A PAUSED run keeps the inputs it is already running with.
    const pausedId = "paused-no-args";
    yield* repo.upsert({ ...baseRow(pausedId), status: "paused" });
    const refused = yield* handlers
      .resumeWorkflowRun({ runId: pausedId, args: { a: 1, b: 1 } })
      .pipe(Effect.result);
    assert.strictEqual(refused._tag, "Failure");
  }).pipe(Effect.provide(TestLayer)),
);
