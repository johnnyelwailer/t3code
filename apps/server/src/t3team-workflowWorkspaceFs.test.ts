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
 *   4. a restored run whose project is unknown keeps the SDK's clear no-workspace error.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
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
import { seedWorkflowStubProject } from "./t3team-workflowStubRuntime.ts";

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
      },
    );
    return { result, launchThreadId };
  });

const runRow = (runId: string) =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    return Option.getOrThrow(yield* repo.getById({ runId }));
  });

it.effect("a script writes under the project root and exists() sees it", () =>
  Effect.gen(function* () {
    const { result } = yield* launchRecipe({
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
