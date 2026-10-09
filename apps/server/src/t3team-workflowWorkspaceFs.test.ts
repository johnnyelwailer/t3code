// @effect-diagnostics nodeBuiltinImport:off - test harness writes a recipe fixture workspace + temp dir.
/**
 * A workflow run's script `ctx.workspace`, through the real launch funnel and boot rehydration.
 *
 * Live bug: a recipe-private script calling `ctx.workspace.writeText(...)` failed with "This
 * workflow run was started without a workspace filesystem" because the engine never handed the run
 * a workspace. Fresh launch (`launchPreparedWorkflow`) and rehydration (`rehydrateSuspendedWorkflowRuns`)
 * now both root one at the PROJECT's workspace root:
 *
 *   1. a script writes a file at the right place under the root, and `exists` sees it;
 *   2. `..` and absolute paths are rejected and nothing is written outside the root;
 *   3. a run that survived a restart (parked on `askUser`) writes through the same workspace;
 *   4. a restored run whose project is unknown keeps the SDK's clear no-workspace error;
 *   5. `.git`, `.t3team-runs` and `.t3` are unavailable, `.github/` is not;
 *   6. the root is the LAUNCH THREAD's worktree when it has one, else the project root — on a
 *      fresh recipe launch and after rehydration alike.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { afterAll } from "vite-plus/test";

import { ServerConfig } from "./config.ts";
import * as ProjectStore from "./orchestration-v2/ProjectStore.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import {
  WorkflowJournalStore,
  WorkflowJournalStoreLive,
} from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepository, WorkflowRunRepositoryLive } from "./persistence/WorkflowRuns.ts";
import { resolveRecipeWorkflowScripts } from "./t3team-recipeWorkflowScripts.ts";
import { rehydrateSuspendedWorkflowRuns } from "./t3team-workflowEngineRehydrate.ts";
import {
  makeWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistryLive,
} from "./t3team-workflowEngineRegistry.ts";
import { launchPreparedWorkflow } from "./t3team-workflowEphemeralLaunch.ts";
import {
  makeFakeWorkflowHost,
  makeFakeWorkflowHostLayer,
} from "./t3team-workflowHostFake.fixtures.ts";
import { T3TeamWorkflowSchedulerLive } from "./t3team-workflowScheduler.ts";
import { T3TeamScriptHost } from "./t3team-scriptHostContext.ts";
import { NoopT3TeamToolBroker, T3TeamToolBroker } from "./t3team-toolBroker.ts";
import { launchRecipeWorkflow } from "./t3team-recipeWorkflowLaunch.ts";
import {
  createWorkflowStubThread,
  makeWorkflowStubRuntime,
  seedWorkflowStubProject,
} from "./t3team-workflowStubRuntime.ts";
import { WORKFLOW_STUB_MODEL_SELECTION } from "./t3team-workflowStubAgentTurn.ts";

const fixtureRoot = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../__fixtures__",
);
// Under __fixtures__ so the recipe's `@t3team/sdk` import resolves (same trick as the sibling
// rehydrate-scripts test). `ws` is the project checkout; its PARENT is where an escape would land.
const sandbox = NodeFS.mkdtempSync(NodePath.join(fixtureRoot, "t3team-workspace-fs-"));
const workspaceRoot = NodePath.join(sandbox, "ws");
NodeFS.mkdirSync(workspaceRoot);
afterAll(() => NodeFS.rmSync(sandbox, { recursive: true, force: true }));

/** A recipe whose one script writes `path`, then reports `exists(path)` and the ctx root. */
function writeRecipeFixture(recipeId: string, input: { readonly askFirst: boolean }) {
  const recipeRoot = NodePath.join(workspaceRoot, ".t3team", "recipes", recipeId);
  NodeFS.mkdirSync(NodePath.join(recipeRoot, "scripts"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(recipeRoot, "scripts", "writeFile.ts"),
    `
import { Schema } from "effect";
import { defineScript } from "@t3team/sdk";

export default defineScript({
  inputs: Schema.Struct({ path: Schema.String, content: Schema.String }),
  outputs: Schema.Struct({ existed: Schema.Boolean, root: Schema.String }),
  handler: async (args, ctx) => {
    await ctx.workspace.writeText(args.path, args.content);
    await ctx.workspace.writeText(args.path + ".root", ctx.workspaceRoot);
    return { existed: await ctx.workspace.exists(args.path), root: ctx.workspaceRoot };
  },
});
`,
  );
  NodeFS.writeFileSync(
    NodePath.join(recipeRoot, "write.workflow.ts"),
    `
import { Schema } from "effect";

export const Inputs = Schema.Struct({ path: Schema.String, content: Schema.String });
export const Outputs = Schema.Struct({ existed: Schema.Boolean, root: Schema.String });

export const meta = {
  name: "${recipeId}.write",
  description: "Write a file into the project through a recipe-private script.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["script", "user"],
} as const;

const input = Schema.decodeSync(Inputs)(args);
${
  input.askFirst
    ? `if (thread === undefined) throw new Error("must run in a launching thread");
await thread.askUser("Write it?", { schema: Schema.Struct({ proceed: Schema.Boolean }) });`
    : ""
}
return await scripts.writeFile({ path: input.path, content: input.content });
`,
  );
  NodeFS.writeFileSync(
    NodePath.join(recipeRoot, "recipe.ts"),
    `
import { defineRecipe, defineWorkflow } from "@t3team/sdk";

import writeFile from "./scripts/writeFile.ts";
import type * as WriteWorkflow from "./write.workflow.ts";

export default defineRecipe({
  id: "${recipeId}",
  version: "0.1.0",
  title: "Write a file",
  shortDescription: "Writes a file into the project.",
  surfaces: ["workitem.detail.sidepanel"],
  scripts: { writeFile },
  defaultAction: defineWorkflow<typeof WriteWorkflow>("./write.workflow.ts"),
});
`,
  );
  return { recipeRoot, workflowPath: NodePath.join(recipeRoot, "write.workflow.ts") };
}

const projectId = ProjectId.make("proj-workspace-fs");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");

const TestLayer = Layer.mergeAll(
  T3TeamWorkflowSchedulerLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        T3TeamWorkflowEngineRegistryLive,
        WorkflowRunRepositoryLive,
        WorkflowJournalStoreLive,
        ProjectStore.layer,
      ),
    ),
    Layer.provide(SqlitePersistenceMemory),
  ),
  makeFakeWorkflowHostLayer().layer,
  ServerConfig.layerTest(sandbox, { prefix: "t3-workspace-fs-test-" }),
).pipe(Layer.provideMerge(NodeServices.layer));

/** Launch through the real fresh-launch funnel on a throwaway registry (a later restart drops it). */
const launchRecipe = (input: {
  readonly runId: string;
  readonly recipeId: string;
  readonly askFirst: boolean;
  readonly args: { readonly path: string; readonly content: string };
}) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { recipeRoot, workflowPath } = writeRecipeFixture(input.recipeId, input);
    const scripts = yield* resolveRecipeWorkflowScripts({ recipePath: recipeRoot, workflowPath });
    const launchThreadId = `thread-${input.runId}`;
    const completed: unknown[] = [];
    const result = yield* launchPreparedWorkflow(
      {
        registry: makeWorkflowEngineRegistry(),
        runRepository: yield* WorkflowRunRepository,
        journalStore: yield* WorkflowJournalStore,
        rearmScheduler: async () => undefined,
        host: makeFakeWorkflowHost().host,
        fileSystem,
        path,
      },
      {
        runId: input.runId,
        workflowPath,
        args: input.args,
        scripts,
        recipePath: recipeRoot,
        workspaceRoot,
        launchThreadId,
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        origin: "recipe",
        onComplete: async (output) => {
          completed.push(output);
        },
      },
    );
    return { result, launchThreadId, completed };
  });

const runRow = (runId: string) =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    return Option.getOrThrow(yield* repo.getById({ runId }));
  });

it.effect("a script writes under the project root and exists() sees it", () =>
  Effect.gen(function* () {
    const { result, completed } = yield* launchRecipe({
      runId: "ws-fs-write",
      recipeId: "ws-fs-write",
      askFirst: false,
      args: { path: ".nexi/machine.json", content: '{"ok":true}' },
    });
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(
      NodeFS.readFileSync(NodePath.join(workspaceRoot, ".nexi", "machine.json"), "utf8"),
      '{"ok":true}',
    );
    // The ctx root is the project root, not the run dir the SDK falls back to.
    assert.deepStrictEqual(completed, [{ existed: true, root: workspaceRoot }]);
    assert.strictEqual((yield* runRow("ws-fs-write")).status, "completed");
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("a path that escapes the root is rejected and writes nothing outside it", () =>
  Effect.gen(function* () {
    const absoluteTarget = NodePath.join(sandbox, "absolute.txt");
    const cases = [
      {
        runId: "ws-fs-dotdot",
        path: "../escape.txt",
        target: NodePath.join(sandbox, "escape.txt"),
      },
      { runId: "ws-fs-absolute", path: absoluteTarget, target: absoluteTarget },
    ];
    for (const escape of cases) {
      const { result } = yield* launchRecipe({
        runId: escape.runId,
        recipeId: escape.runId,
        askFirst: false,
        args: { path: escape.path, content: "nope" },
      });
      assert.strictEqual(result.status, "failed", escape.path);
      const row = yield* runRow(escape.runId);
      assert.strictEqual(row.status, "failed");
      assert.include(row.failureReason ?? "", "resolves outside", escape.path);
      assert.isFalse(NodeFS.existsSync(escape.target), escape.path);
    }
  }).pipe(Effect.provide(TestLayer)),
);

/** Park a run on `askUser`, restart (real rehydration), answer, and return the settled row. */
const restartAndAnswer = (runId: string) =>
  Effect.gen(function* () {
    const parked = yield* runRow(runId);
    assert.strictEqual(parked.status, "suspended");
    yield* rehydrateSuspendedWorkflowRuns();
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const ask = registry.peekPending(`thread-${runId}`);
    assert.strictEqual(ask?.correlationId, parked.pendingCorrelationId);
    yield* Effect.promise(() =>
      registry.getRun(runId)!.resume(ask!.correlationId, { proceed: true }),
    );
    return yield* runRow(runId);
  });

it.effect("a run rehydrated after a restart writes through the same project workspace", () =>
  Effect.gen(function* () {
    yield* seedWorkflowStubProject({ projectId, workspaceRoot });
    const runId = "ws-fs-rehydrated";
    const { result } = yield* launchRecipe({
      runId,
      recipeId: runId,
      askFirst: true,
      args: { path: "rehydrated/out.txt", content: "after restart" },
    });
    assert.strictEqual(result.status, "suspended");
    assert.isFalse(NodeFS.existsSync(NodePath.join(workspaceRoot, "rehydrated", "out.txt")));

    const settled = yield* restartAndAnswer(runId);

    assert.strictEqual(settled.status, "completed");
    assert.strictEqual(
      NodeFS.readFileSync(NodePath.join(workspaceRoot, "rehydrated", "out.txt"), "utf8"),
      "after restart",
    );
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("a restored run whose project is gone keeps the clear no-workspace error", () =>
  Effect.gen(function* () {
    // Fresh in-memory DB per it.effect build: no project row exists for this run's project.
    const runId = "ws-fs-no-project";
    const { result } = yield* launchRecipe({
      runId,
      recipeId: runId,
      askFirst: true,
      args: { path: "never.txt", content: "x" },
    });
    assert.strictEqual(result.status, "suspended");

    const settled = yield* restartAndAnswer(runId);

    assert.strictEqual(settled.status, "failed");
    assert.include(settled.failureReason ?? "", "without a workspace filesystem");
    assert.isFalse(NodeFS.existsSync(NodePath.join(workspaceRoot, "never.txt")));
  }).pipe(Effect.provide(TestLayer)),
);

it.effect("reserved entries are refused for write, while .github and .nexi stay writable", () =>
  Effect.gen(function* () {
    const denied = [".git/config", ".t3team-runs/other-run/workflow.ts", ".t3/state.json"];
    for (const [index, path] of [...denied, "a/../.git/hooks/pre-commit"].entries()) {
      const runId = `ws-fs-reserved-${index}`;
      const { result } = yield* launchRecipe({
        runId,
        recipeId: runId,
        askFirst: false,
        args: { path, content: "tampered" },
      });
      assert.strictEqual(result.status, "failed", path);
      assert.include((yield* runRow(runId)).failureReason ?? "", "cannot access", path);
    }
    assert.isFalse(NodeFS.existsSync(NodePath.join(workspaceRoot, ".git")));
    assert.isFalse(NodeFS.existsSync(NodePath.join(workspaceRoot, ".t3")));
    assert.isFalse(NodeFS.existsSync(NodePath.join(workspaceRoot, ".t3team-runs", "other-run")));

    const { result } = yield* launchRecipe({
      runId: "ws-fs-github",
      recipeId: "ws-fs-github",
      askFirst: false,
      args: { path: ".github/workflows/x.yml", content: "name: x" },
    });
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(
      NodeFS.readFileSync(NodePath.join(workspaceRoot, ".github", "workflows", "x.yml"), "utf8"),
      "name: x",
    );
  }).pipe(Effect.provide(TestLayer)),
);

// ── Launch-thread checkout: the worktree when the thread has one, else the project root ─────────
// Driven through the real recipe launch route (`launchRecipeWorkflow`) and boot rehydration over a
// real V2 runtime, so the thread → root derivation is what is under test, not a handed-in root.

const worktreeRoot = NodePath.join(sandbox, "wt");
NodeFS.mkdirSync(worktreeRoot);

const checkoutLayer = () => {
  const stub = makeWorkflowStubRuntime({ name: "t3team-workspace-fs", respond: () => "ok" });
  return Layer.mergeAll(
    T3TeamWorkflowSchedulerLive,
    Layer.succeed(T3TeamToolBroker, NoopT3TeamToolBroker),
    Layer.succeed(T3TeamScriptHost, { forRun: () => ({}) }),
    ServerConfig.layerTest(sandbox, { prefix: "t3-workspace-fs-checkout-" }),
  ).pipe(Layer.provideMerge(stub.layer), Layer.provideMerge(NodeServices.layer));
};

const launchOnThread = (input: {
  readonly name: string;
  readonly worktreePath: string | undefined;
  readonly askFirst: boolean;
}) =>
  Effect.gen(function* () {
    yield* seedWorkflowStubProject({ projectId, workspaceRoot });
    const threadId = `thread-${input.name}`;
    yield* createWorkflowStubThread({
      threadId,
      projectId,
      ...(input.worktreePath === undefined ? {} : { worktreePath: input.worktreePath }),
    });
    const { recipeRoot, workflowPath } = writeRecipeFixture(input.name, input);
    const launched = yield* launchRecipeWorkflow({
      threadId: ThreadId.make(threadId),
      recipePath: recipeRoot,
      workflowPath,
      args: { path: `${input.name}/out.txt`, content: input.name },
      modelSelection: createModelSelection(
        WORKFLOW_STUB_MODEL_SELECTION.instanceId,
        WORKFLOW_STUB_MODEL_SELECTION.model,
      ),
      runtimeMode: "full-access",
      interactionMode: "default",
    });
    return { launched, threadId, runId: launched.runId };
  });

const wrote = (root: string, name: string) => ({
  file: NodeFS.existsSync(NodePath.join(root, name, "out.txt")),
  root: NodeFS.existsSync(NodePath.join(root, name, "out.txt.root"))
    ? NodeFS.readFileSync(NodePath.join(root, name, "out.txt.root"), "utf8")
    : undefined,
});

it.live("a launch thread with a worktree writes into that worktree, not the project root", () =>
  Effect.gen(function* () {
    const name = "ws-fs-thread-worktree";
    const { launched } = yield* launchOnThread({
      name,
      worktreePath: worktreeRoot,
      askFirst: false,
    });
    assert.strictEqual(launched.status, "completed");
    assert.deepStrictEqual(wrote(worktreeRoot, name), { file: true, root: worktreeRoot });
    assert.deepStrictEqual(wrote(workspaceRoot, name), { file: false, root: undefined });
  }).pipe(Effect.scoped, Effect.provide(checkoutLayer())),
);

it.live("a launch thread without a worktree writes into the project root", () =>
  Effect.gen(function* () {
    const name = "ws-fs-thread-root";
    const { launched } = yield* launchOnThread({ name, worktreePath: undefined, askFirst: false });
    assert.strictEqual(launched.status, "completed");
    assert.deepStrictEqual(wrote(workspaceRoot, name), { file: true, root: workspaceRoot });
    assert.deepStrictEqual(wrote(worktreeRoot, name), { file: false, root: undefined });
  }).pipe(Effect.scoped, Effect.provide(checkoutLayer())),
);

it.live("rehydration re-derives the launch thread's worktree for a restored run", () =>
  Effect.gen(function* () {
    const name = "ws-fs-thread-rehydrated";
    const { launched, runId, threadId } = yield* launchOnThread({
      name,
      worktreePath: worktreeRoot,
      askFirst: true,
    });
    assert.strictEqual(launched.status, "suspended");

    // Restart: drop the live controller, then let the real boot rehydration rebuild it.
    const registry = yield* T3TeamWorkflowEngineRegistry;
    registry.deleteRun(runId);
    registry.removePendingForRun(runId);
    yield* rehydrateSuspendedWorkflowRuns();
    const ask = registry.peekPending(threadId);
    assert.strictEqual(ask?.kind, "user.input");
    yield* Effect.promise(() =>
      registry.getRun(runId)!.resume(ask!.correlationId, { proceed: true }),
    );

    assert.strictEqual((yield* runRow(runId)).status, "completed");
    assert.deepStrictEqual(wrote(worktreeRoot, name), { file: true, root: worktreeRoot });
    assert.deepStrictEqual(wrote(workspaceRoot, name), { file: false, root: undefined });
  }).pipe(Effect.scoped, Effect.provide(checkoutLayer())),
);
