/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Matches the sibling recipe agent-tool tests. */
/**
 * One recipe, several actions (Epic 16 §Plugin Modules).
 *
 * Pins the three things that must hold once a recipe can declare `actions: { <name>: workflow }`:
 *   1. resolution — a named action runs ITS workflow, no name runs `defaultAction`, an unknown name
 *      is an error rather than a silent fallback;
 *   2. propagation — discovery and the agent-facing `t3work.recipe.list` carry the action names, so
 *      a model can pick one;
 *   3. authorization — an action's workflow becomes runnable BY NAME, and a sibling `.workflow.ts`
 *      the recipe does not declare stays refused (identity, never directory containment).
 */
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { resolveLaunchWorkflowPath } from "./t3work-projectRecipeActionLaunch.ts";
import {
  loadPackRecipeSources,
  PACK_RECIPE_CAPABILITY,
  setPackRecipeSources,
} from "./t3work-packRecipeSources.ts";
import { discoverProjectRecipes } from "./t3work-projectRecipeDiscovery.ts";
import { listProjectRecipesForAgent } from "./t3work-recipeAgentList.ts";
import { resolveRecipeWorkflowScripts } from "./t3work-recipeWorkflowScripts.ts";
import { resolveRunWorkflowPath } from "./t3work-workflowRunPathAuthorize.ts";
import { backlogRenderContext } from "./t3work-projectRecipeRenderContext.fixtures.ts";

// Temp trees live under `__fixtures__` so a typed `recipe.ts`'s `import("@t3work/sdk")` resolves
// through the monorepo's node_modules chain (same reason as t3work-recipeAgentList.test.ts).
const fixturesRoot = NodeURL.fileURLToPath(new URL("../__fixtures__/", import.meta.url));

const WORKFLOW = (name: string) =>
  [`export const meta = { name: "${name}" } as const;`, `return { done: "${name}" };`].join("\n");

const makeTempDir = Effect.fn("makeTempDir")(function* (prefix: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({ directory: fixturesRoot, prefix });
});

/** A typed recipe with a default action, two named actions, and an UNDECLARED sibling workflow. */
const writeMultiActionRecipe = Effect.fn("writeMultiActionRecipe")(function* (input: {
  readonly recipeRoot: string;
  readonly id: string;
  readonly scripts?: boolean;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.makeDirectory(input.recipeRoot, { recursive: true });
  for (const name of ["plan", "estimate", "review", "undeclared"]) {
    yield* fileSystem.writeFileString(
      path.join(input.recipeRoot, `${name}.workflow.ts`),
      WORKFLOW(`${input.id}.${name}`),
    );
  }
  if (input.scripts === true) {
    yield* fileSystem.makeDirectory(path.join(input.recipeRoot, "scripts"), { recursive: true });
    yield* fileSystem.writeFileString(
      path.join(input.recipeRoot, "scripts/collect.ts"),
      [
        `import { defineScript } from "@t3work/sdk";`,
        `import { Schema } from "effect";`,
        `export default defineScript({`,
        `  inputs: Schema.Struct({}),`,
        `  outputs: Schema.Struct({ ok: Schema.Boolean }),`,
        `  handler: async () => ({ ok: true }),`,
        `});`,
      ].join("\n"),
    );
  }
  yield* fileSystem.writeFileString(
    path.join(input.recipeRoot, "recipe.ts"),
    [
      `import { defineRecipe, defineWorkflow } from "@t3work/sdk";`,
      ...(input.scripts === true ? [`import collect from "./scripts/collect.ts";`] : []),
      `export default defineRecipe({`,
      `  id: "${input.id}",`,
      `  version: "0.1.0",`,
      `  scope: "project",`,
      `  title: "Multi-action ${input.id}",`,
      `  shortDescription: "A recipe with several actions.",`,
      `  surfaces: ["project.dashboard.backlog"],`,
      `  appliesTo: {},`,
      `  allowedToolGroups: [],`,
      ...(input.scripts === true ? [`  scripts: { collect },`] : []),
      `  defaultAction: defineWorkflow("./plan.workflow.ts"),`,
      `  actions: {`,
      `    estimate: defineWorkflow("./estimate.workflow.ts"),`,
      `    review: defineWorkflow("./review.workflow.ts"),`,
      `  },`,
      `});`,
    ].join("\n"),
  );
});

const registerPack = (input: {
  readonly directory: string;
  readonly recipes: ReadonlyArray<{ readonly id: string; readonly path: string }>;
}) =>
  setPackRecipeSources(
    loadPackRecipeSources({
      enabled: true,
      root: "/packs",
      issues: [],
      resolution: {
        packs: [
          {
            directory: input.directory,
            manifest: {
              id: "nexplore-global",
              version: "0.1.0",
              packApiVersion: 1,
              name: "Nexplore Global",
              scope: "distribution",
              compatibility: { t3workCore: "*" },
              contents: { recipes: input.recipes },
              capabilities: [PACK_RECIPE_CAPABILITY],
              hashes: {},
            },
          },
        ],
        locks: {},
        diagnostics: [],
      },
    } as never),
  );

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect.pipe(Effect.provide(NodeServices.layer))));

afterEach(() => {
  setPackRecipeSources({ sources: [], diagnostics: [] });
});

describe("multi-action recipes", () => {
  it("resolves a named action, falls back to defaultAction, and refuses an unknown name", async () => {
    await run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const workspaceRoot = yield* makeTempDir("t3work-actions-ws-");
        const recipeRoot = path.join(workspaceRoot, ".t3work/recipes/multi");
        yield* writeMultiActionRecipe({ recipeRoot, id: "multi" });
        const defaultPath = path.join(recipeRoot, "plan.workflow.ts");

        // Named action → that action's workflow.
        const named = yield* resolveLaunchWorkflowPath({
          recipePath: recipeRoot,
          workflowPath: defaultPath,
          actionName: "estimate",
        });
        expect(named).toBe(path.join(recipeRoot, "estimate.workflow.ts"));

        // Absent name and the reserved "default" name → defaultAction, exactly as today.
        for (const actionName of [undefined, "", "  ", "default"]) {
          const fallback = yield* resolveLaunchWorkflowPath({
            recipePath: recipeRoot,
            workflowPath: defaultPath,
            actionName,
          });
          expect(fallback).toBe(defaultPath);
        }

        // Unknown name → a loud error naming the available actions, never a silent default launch.
        const unknown = yield* resolveLaunchWorkflowPath({
          recipePath: recipeRoot,
          workflowPath: defaultPath,
          actionName: "nope",
        }).pipe(Effect.result);
        expect(unknown._tag).toBe("Failure");
        if (unknown._tag === "Failure") {
          expect(unknown.failure.message).toContain("has no action 'nope'");
          expect(unknown.failure.message).toContain("estimate");
          expect(unknown.failure.message).toContain("review");
        }

        // An action name without a recipe directory cannot be resolved from a module → refused.
        const noRecipePath = yield* resolveLaunchWorkflowPath({
          recipePath: undefined,
          workflowPath: defaultPath,
          actionName: "estimate",
        }).pipe(Effect.result);
        expect(noRecipePath._tag).toBe("Failure");
      }),
    );
  });

  it("carries action names through discovery and the agent-facing recipe list", async () => {
    await run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const workspaceRoot = yield* makeTempDir("t3work-actions-ws-");
        const recipeRoot = path.join(workspaceRoot, ".t3work/recipes/multi");
        yield* writeMultiActionRecipe({ recipeRoot, id: "multi" });

        const discovered = yield* discoverProjectRecipes({
          workspaceRoot,
          context: backlogRenderContext(),
        });
        const recipe = discovered.recipes.find((entry) => entry.id === "multi");
        expect(recipe?.workflowPath).toBe(path.join(recipeRoot, "plan.workflow.ts"));
        // `defaultAction` stays in `workflowPath`; only the EXTRA actions are listed.
        expect(recipe?.actions).toEqual([
          { name: "estimate", workflowPath: path.join(recipeRoot, "estimate.workflow.ts") },
          { name: "review", workflowPath: path.join(recipeRoot, "review.workflow.ts") },
        ]);

        const listed = yield* listProjectRecipesForAgent({ workspaceRoot });
        const entry = listed.recipes.find((candidate) => candidate.id === "multi");
        expect(entry?.actions?.map((action) => action.name)).toEqual(["estimate", "review"]);
      }),
    );
  });

  it("keeps a single-action recipe's payload unchanged (no actions key)", async () => {
    await run(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* makeTempDir("t3work-actions-ws-");
        const recipeRoot = path.join(workspaceRoot, ".t3work/recipes/single");
        yield* fileSystem.makeDirectory(recipeRoot, { recursive: true });
        yield* fileSystem.writeFileString(
          path.join(recipeRoot, "single.workflow.ts"),
          WORKFLOW("single.workflow"),
        );
        yield* fileSystem.writeFileString(
          path.join(recipeRoot, "recipe.ts"),
          [
            `import { defineRecipe, defineWorkflow } from "@t3work/sdk";`,
            `export default defineRecipe({`,
            `  id: "single",`,
            `  version: "0.1.0",`,
            `  title: "Single action",`,
            `  shortDescription: "Declarative, one workflow.",`,
            `  surfaces: ["project.dashboard.backlog"],`,
            `  appliesTo: {},`,
            `  defaultAction: defineWorkflow("./single.workflow.ts"),`,
            `});`,
          ].join("\n"),
        );

        const discovered = yield* discoverProjectRecipes({
          workspaceRoot,
          context: backlogRenderContext(),
        });
        const recipe = discovered.recipes.find((entry) => entry.id === "single");
        expect(recipe?.workflowPath).toBe(path.join(recipeRoot, "single.workflow.ts"));
        expect(recipe?.actions).toBeUndefined();
      }),
    );
  });

  it("authorizes each DECLARED action of a pack recipe but refuses an undeclared sibling", async () => {
    await run(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const packDir = yield* makeTempDir("t3work-actions-pack-");
        const workspaceRoot = yield* makeTempDir("t3work-actions-ws-");
        const recipeRoot = path.join(packDir, "recipes/multi");
        yield* writeMultiActionRecipe({ recipeRoot, id: "multi" });
        registerPack({ directory: packDir, recipes: [{ id: "multi", path: "recipes/multi" }] });

        const authorize = (workflowPath: string) =>
          resolveRunWorkflowPath({
            fileSystem,
            path,
            workspaceRoot,
            runId: "run-1",
            args: { workflowPath },
          }).pipe(Effect.result);

        for (const declared of ["plan", "estimate", "review"]) {
          const target = path.join(recipeRoot, `${declared}.workflow.ts`);
          const result = yield* authorize(target);
          expect(result._tag).toBe("Success");
        }

        // Sits in the same recipe directory, is a real `.workflow.ts`, is NOT a declared action.
        const undeclared = path.join(recipeRoot, "undeclared.workflow.ts");
        expect(yield* fileSystem.exists(undeclared)).toBe(true);
        const refused = yield* authorize(undeclared);
        expect(refused._tag).toBe("Failure");
      }),
    );
  });

  it("lets a recipe's own scripts back any of its declared actions, but not another file", async () => {
    await run(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const workspaceRoot = yield* makeTempDir("t3work-actions-ws-");
        const recipeRoot = path.join(workspaceRoot, ".t3work/recipes/multi");
        yield* writeMultiActionRecipe({ recipeRoot, id: "multi", scripts: true });

        for (const declared of ["plan", "estimate", "review"]) {
          const scripts = yield* resolveRecipeWorkflowScripts({
            recipePath: recipeRoot,
            workflowPath: path.join(recipeRoot, `${declared}.workflow.ts`),
          });
          expect(Object.keys(scripts)).toEqual(["collect"]);
        }

        const foreign = yield* resolveRecipeWorkflowScripts({
          recipePath: recipeRoot,
          workflowPath: path.join(recipeRoot, "undeclared.workflow.ts"),
        }).pipe(Effect.result);
        expect(foreign._tag).toBe("Failure");
      }),
    );
  });
});
