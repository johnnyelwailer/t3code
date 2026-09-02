/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
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
import * as Stream from "effect/Stream";
import { afterAll } from "vite-plus/test";

import { ServerConfig } from "./config.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowJournalStoreLive } from "./persistence/Layers/SqliteJournalStore.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
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
  T3TeamWorkflowScheduler,
  T3TeamWorkflowSchedulerLive,
} from "./t3team-workflowScheduler.ts";

const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-resume-tool-"));
afterAll(() => NodeFS.rmSync(cwd, { recursive: true, force: true }));

const projectId = ProjectId.make("proj-resume-tool");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const threadId = ThreadId.make("resume-tool-thread");
const nowIso = (): string => "2026-07-20T00:00:00.000Z";

const stubEngine: OrchestrationEngineShape = {
  readEvents: () => Stream.empty,
  dispatch: () => Effect.succeed({ sequence: 0 }),
  streamDomainEvents: Stream.never,
  // Required by OrchestrationEngineShape since main's sidebar/turn work; this stub never
  // dispatches, so the latest sequence is simply 0.
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
    dispatch: () => Promise.resolve(),
    loadThreadProject: () => Effect.succeed({ project: { workspaceRoot: cwd } }),
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
          dispatch: () => Promise.resolve(),
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

// Declares meta.inputs, so a launch with the wrong shape fails BEFORE the body runs — an
// input-contract fault (WorkflowInputDecodeError), not a source defect.
const argsFixtureSource = `import { Schema } from "effect";
import { getArgs } from "@t3team/sdk";
export const Inputs = Schema.Struct({ words: Schema.Array(Schema.String) });
export const Outputs = Schema.Struct({ joined: Schema.String });
export const meta = { name: "resume-tool.args-fixture", inputs: Inputs, outputs: Outputs } as const;
export default async function run() {
  const input = getArgs();
  return { joined: input.words.join(",") };
}
`;

it.live(
  "failed + corrected args: rewrites the journal's args baseline and the run completes",
  () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const store = yield* WorkflowJournalStore;
      const handlers = yield* makeHandlers;
      const runId = "failed-args-run";
      const runDir = NodePath.join(cwd, ".t3team-runs", runId);
      const workflowPath = NodePath.join(runDir, "workflow.ts");
      NodeFS.mkdirSync(runDir, { recursive: true });
      NodeFS.writeFileSync(workflowPath, argsFixtureSource);

      // Launch with args missing the declared `words` key — resumeWorkflow's own
      // assertInputArgsMatch never runs on a fresh start, so this fails inside the body's
      // meta.inputs decode, before any journal entry is written.
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
          dispatch: () => Promise.resolve(),
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

      const value = yield* handlers.resumeWorkflowRun({ runId, args: { words: ["a", "b"] } });
      assert.strictEqual(value.status, "accepted");

      // The re-drive runs detached; the durable row is the observable outcome. Had the journal's
      // args baseline not been rewritten, resumeWorkflow's assertInputArgsMatch would reject this
      // as replay drift instead of completing — that failure mode is what this test guards.
      yield* Effect.gen(function* () {
        for (let i = 0; i < 200; i += 1) {
          const row = Option.getOrThrow(yield* repo.getById({ runId }));
          if (row.status === "completed") return;
          yield* Effect.sleep(Duration.millis(25));
        }
        return yield* Effect.die(new Error("timed out waiting for resumed run to complete"));
      });
      const finalRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.deepStrictEqual(finalRow.args, { words: ["a", "b"] });
    }).pipe(Effect.provide(TestLayer)),
);

it.effect("scopes a corrected-args resume to the calling thread", () =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const handlers = yield* makeHandlers;
    yield* repo.upsert({
      ...baseRow("other-thread-args-run"),
      status: "failed",
      launchThreadId: "someone-else",
    });
    const error = yield* handlers
      .resumeWorkflowRun({ runId: "other-thread-args-run", args: { words: ["x"] } })
      .pipe(Effect.flip);
    assert.match(error, /No orchestration run found/);
    // Never touched: scoping is checked before any source/args replacement runs.
    const row = Option.getOrThrow(yield* repo.getById({ runId: "other-thread-args-run" }));
    assert.deepStrictEqual(row.args, {});
  }).pipe(Effect.provide(TestLayer)),
);
