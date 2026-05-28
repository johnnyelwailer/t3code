import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as Stream from "effect/Stream";
import { ThreadId } from "@t3tools/contracts";
import type { ProjectRecipeWorkflowLaunch } from "@t3tools/project-recipes";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.js";
import { runProjectRecipeWorkflowLaunch } from "./t3work-recipeWorkflowRuntime.js";
import { workflowRunIdForThread } from "./t3work-recipeWorkflowRuntimeShared.js";

const CREATED_AT = "2026-05-28T14:00:00.000Z";

function createMockOrchestration(): OrchestrationEngineShape {
  return {
    readEvents: () => Stream.empty,
    dispatch: () => Effect.succeed({ sequence: 1 }),
    streamDomainEvents: Stream.empty,
  };
}

const makeTempWorkspace = Effect.fn("makeTempWorkspace")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({
    prefix: "t3work-recipe-materialization-",
  });
});

const writeRecipeFixture = Effect.fn("writeRecipeFixture")(function* (input: {
  readonly workspaceRoot: string;
}): Effect.fn.Return<
  {
    readonly recipeRoot: string;
    readonly workflowPath: string;
    readonly promptPath: string;
  },
  PlatformError.PlatformError,
  FileSystem.FileSystem
> {
  const fileSystem = yield* FileSystem.FileSystem;
  const recipeRoot = `${input.workspaceRoot}/.t3work/recipes/create-recipe`;

  yield* fileSystem.makeDirectory(`${recipeRoot}/files`, { recursive: true });
  yield* fileSystem.writeFileString(
    `${recipeRoot}/workflow.ts`,
    [
      "export const steps = [",
      '  { kind: "agent", id: "draft", promptPath: "./prompt.md" },',
      "];",
      "",
    ].join("\n"),
  );
  yield* fileSystem.writeFileString(
    `${recipeRoot}/prompt.md`,
    ["# Create recipe", "", "Read the materialized context before drafting."].join("\n"),
  );
  yield* fileSystem.writeFileString(
    `${recipeRoot}/files/recipe-template.md`,
    ["# Recipe template", "", "- name:"].join("\n"),
  );

  return {
    recipeRoot,
    workflowPath: `${recipeRoot}/workflow.ts`,
    promptPath: `${recipeRoot}/prompt.md`,
  };
});

function buildLaunch(input: {
  readonly recipeRoot: string;
  readonly workflowPath: string;
  readonly promptPath: string;
}): ProjectRecipeWorkflowLaunch {
  return {
    kind: "recipe",
    recipeId: "create-recipe",
    recipeVersion: "0.1.0",
    title: "Create a project-local recipe",
    description: "Scaffold a recipe from the current context.",
    source: "project-local",
    surface: "thread.context",
    recipePath: input.recipeRoot,
    promptPath: input.promptPath,
    workflowPath: input.workflowPath,
    allowedToolGroups: ["artifact.rw"],
  };
}

it.layer(NodeServices.layer)("runProjectRecipeWorkflowLaunch materialization", (it) => {
  it.effect("writes the run directory artifacts before the first agent turn", () =>
    Effect.gen(function* () {
      const workspaceRoot = yield* makeTempWorkspace();
      const fixture = yield* writeRecipeFixture({ workspaceRoot });
      const threadId = ThreadId.make("thread-materialized-run");

      const result = yield* runProjectRecipeWorkflowLaunch({
        orchestration: createMockOrchestration(),
        threadId,
        workspaceRoot,
        launch: buildLaunch(fixture),
        kickoffMessage: "Author a recipe for this context.",
        createdAt: CREATED_AT,
      });

      expect(result.turnStartMessage).toBeDefined();

      const fileSystem = yield* FileSystem.FileSystem;
      const runRoot = `${workspaceRoot}/runs/${workflowRunIdForThread(threadId)}/recipe`;
      const expectedFiles = [
        `${runRoot}/context.json`,
        `${runRoot}/context.schema.json`,
        `${runRoot}/context-map.md`,
        `${runRoot}/prompt.md`,
        `${runRoot}/workflow-state.json`,
        `${runRoot}/recipe.json`,
        `${runRoot}/files/recipe-template.md`,
      ] as const;

      for (const filePath of expectedFiles) {
        expect(yield* fileSystem.exists(filePath)).toBe(true);
      }

      const promptText = yield* fileSystem.readFileString(`${runRoot}/prompt.md`);
      const contextJson = yield* fileSystem.readFileString(`${runRoot}/context.json`);

      expect(promptText).toContain("Read the materialized context before drafting.");
      expect(contextJson).toContain('"project"');
    }).pipe(Effect.scoped),
  );
});
