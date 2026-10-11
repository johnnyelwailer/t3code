// @effect-diagnostics nodeBuiltinImport:off - recipe fixtures live under __fixtures__ on disk.
/**
 * `t3_orchestration_run { recipe, action }` (G11): a recipe action runs by id through the recipe
 * list's precedence, with origin `recipe`, its launch fact and the recipe's own bindings; an
 * unknown id or action, or a prompt action, fails closed before anything durable.
 */
import * as NodeURL from "node:url";

import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import {
  WorkflowJournalStore,
  WorkflowJournalStoreLive,
} from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepository, WorkflowRunRepositoryLive } from "./persistence/WorkflowRuns.ts";
import { HIDDEN_T3TEAM_DIR } from "./t3team-project-repository-utils.ts";
import { resolveRecipeActionById } from "./t3team-recipeRunById.ts";
import { makeWorkflowRunToolHandlers } from "./t3team-toolBrokerWorkflowRunTools.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";

const fixturesRoot = NodeURL.fileURLToPath(new URL("../__fixtures__/", import.meta.url));
const intent = {
  goal: "Fix the red check.",
  expectedOutcome: "The check is green.",
  guardrails: ["Only touch the PR branch."],
} as const;

const writeRecipe = Effect.fn("writeRecipe")(function* (workspaceRoot: string, id: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.join(workspaceRoot, `${HIDDEN_T3TEAM_DIR}/recipes`, id);
  yield* fileSystem.makeDirectory(root, { recursive: true });
  for (const name of ["default", "fix"]) {
    yield* fileSystem.writeFileString(
      path.join(root, `${name}.workflow.ts`),
      `export const meta = { name: "${id}.${name}" } as const;\nreturn { action: "${name}" };`,
    );
  }
  yield* fileSystem.writeFileString(path.join(root, "brief.md"), "Brief.");
  yield* fileSystem.writeFileString(
    path.join(root, "recipe.ts"),
    [
      `import { definePrompt, defineRecipe, defineWorkflow } from "@t3team/sdk";`,
      `export default defineRecipe({`,
      `  id: "${id}", version: "1.1.0", scope: "project", title: "${id}",`,
      `  shortDescription: "Test recipe.", surfaces: ["project.dashboard.backlog"],`,
      `  appliesTo: {}, allowedToolGroups: [],`,
      `  defaultAction: defineWorkflow("./default.workflow.ts"),`,
      `  actions: { fix: defineWorkflow("./fix.workflow.ts"), brief: definePrompt("./brief.md") },`,
      `});`,
    ].join("\n"),
  );
  return root;
});

const TestLayer = Layer.mergeAll(
  NodeServices.layer,
  Layer.mergeAll(WorkflowRunRepositoryLive, WorkflowJournalStoreLive).pipe(
    Layer.provideMerge(SqlitePersistenceMemory),
  ),
);

describe("recipe actions by id", () => {
  it.layer(TestLayer)((it) => {
    it.effect("resolves the default and a named action, and fails closed otherwise", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
          directory: fixturesRoot,
          prefix: "t3team-recipe-run-by-id-",
        });
        const root = yield* writeRecipe(workspaceRoot, "pr-fix-ci");
        const resolve = (recipeId: string, action?: string) =>
          resolveRecipeActionById({ workspaceRoot, recipeId, action }).pipe(Effect.result);

        const fallback = yield* resolve("pr-fix-ci");
        assert.isTrue(fallback._tag === "Success");
        if (fallback._tag === "Success") {
          assert.strictEqual(fallback.success.action, "default");
          assert.isTrue(fallback.success.workflowPath.endsWith("default.workflow.ts"));
          assert.strictEqual(fallback.success.source, "project-local");
          assert.strictEqual(fallback.success.recipePath.replace(/\/$/, ""), root);
        }
        const fix = yield* resolve("pr-fix-ci", "fix");
        assert.isTrue(
          fix._tag === "Success" && fix.success.workflowPath.endsWith("fix.workflow.ts"),
        );

        const failures = [
          yield* resolve("no-such-recipe"),
          yield* resolve("pr-fix-ci", "nope"),
          yield* resolve("pr-fix-ci", "brief"),
        ].map((result) => (result._tag === "Failure" ? String(result.failure) : "launched"));
        assert.include(failures[0], "No recipe 'no-such-recipe'");
        assert.include(failures[1], "has no action 'nope'; runnable: default, fix");
        assert.include(failures[2], "is a prompt");
      }),
    );

    it.effect("runs the recipe on the calling thread with origin recipe and its launch fact", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const repo = yield* WorkflowRunRepository;
        const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
          directory: fixturesRoot,
          prefix: "t3team-recipe-run-by-id-",
        });
        yield* writeRecipe(workspaceRoot, "pr-fix-ci");
        const facts: Array<unknown> = [];
        const threadId = ThreadId.make("thread:watch-412");
        const modelSelection = createModelSelection(ProviderInstanceId.make("inst"), "model");
        const handlers = makeWorkflowRunToolHandlers({
          fileSystem,
          path,
          launch: {
            registry: makeWorkflowEngineRegistry(),
            runRepository: repo,
            journalStore: yield* WorkflowJournalStore,
            rearmScheduler: () => Promise.resolve(),
            host: makeFakeWorkflowHost().host,
          },
          loadThreadProject: () =>
            Effect.succeed({
              project: { workspaceRoot, defaultModelSelection: modelSelection },
              thread: {
                projectId: ProjectId.make("project:hive"),
                runtimeMode: "approval-required" as const,
                interactionMode: "default" as const,
                modelSelection,
              },
            }),
          recipeRun: {
            toolBroker: () => ({ bindSession: () => Effect.succeed(undefined) }),
            scriptHosts: { forRun: () => ({}) },
            recordLaunchFact: (input) => Effect.sync(() => void facts.push(input)),
          },
        })(threadId);

        // Refusals come before anything durable: the run named to replace is never stopped.
        const stopped: string[] = [];
        const disabled = makeWorkflowRunToolHandlers({
          fileSystem,
          path,
          launch: {
            registry: makeWorkflowEngineRegistry(),
            runRepository: repo,
            journalStore: yield* WorkflowJournalStore,
            rearmScheduler: () => Promise.resolve(),
            host: makeFakeWorkflowHost().host,
          },
          loadThreadProject: () =>
            Effect.succeed({
              project: { workspaceRoot, defaultModelSelection: modelSelection },
              thread: {
                projectId: ProjectId.make("project:hive"),
                runtimeMode: "approval-required" as const,
                interactionMode: "default" as const,
                modelSelection,
              },
            }),
          stopRun: (_thread, runId) => Effect.sync(() => void stopped.push(runId)),
        })(threadId);
        const notEnabled = yield* disabled
          .runWorkflow({ recipe: "pr-fix-ci", intent, replaceRunId: "earlier-run" })
          .pipe(Effect.flip);
        assert.include(notEnabled, "not enabled");
        assert.deepStrictEqual(stopped, []);

        const refused = yield* handlers
          .runWorkflow({ recipe: "missing", intent })
          .pipe(Effect.flip);
        assert.include(refused, "No recipe 'missing'");
        assert.deepStrictEqual(facts, []);

        const launched = yield* handlers.runWorkflow({
          recipe: "pr-fix-ci",
          action: "fix",
          args: { pr: "https://github.com/acme/app/pull/7" },
          intent,
        });
        assert.strictEqual(launched.status, "accepted");
        const row = yield* repo.getById({ runId: launched.runId });
        assert.isTrue(Option.isSome(row));
        if (Option.isSome(row)) {
          assert.strictEqual(row.value.origin, "recipe");
          assert.strictEqual(row.value.runtimeMode, "approval-required");
          assert.isTrue(row.value.workflowPath.endsWith("fix.workflow.ts"));
          assert.isTrue((row.value.recipePath ?? "").includes("pr-fix-ci"));
        }
        assert.deepInclude(facts[0] as object, {
          threadId,
          runId: launched.runId,
          recipe: { id: "pr-fix-ci", version: undefined, action: "fix" },
        });
      }),
    );
  });
});
