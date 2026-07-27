/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Matches the sibling recipe discovery tests. */
/**
 * ctx-derived recipe metadata (Epic 16 §Plugin Modules): the spec's authored form is
 * `displayName: (ctx) => …`, `icon: (ctx) => …`, `rank: (ctx) => …`, `visible: (ctx) => …`.
 *
 * These tests pin the four properties that make the functional form safe to ship:
 *   1. derivers are EVALUATED against the render context, so discovery shows per-context labels;
 *   2. the declarative form (plain strings + `appliesTo`) is unchanged;
 *   3. `visible` NARROWS ONLY — it is ANDed with `appliesTo`, so it can never resurrect a recipe
 *      the declarative gate excluded;
 *   4. a THROWING deriver hides that one recipe and leaves the rest of the catalog intact.
 */
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import { describe, expect, it } from "vite-plus/test";

import { discoverProjectRecipes } from "./t3team-projectRecipeDiscovery.ts";
import { backlogRenderContext } from "./t3team-projectRecipeRenderContext.fixtures.ts";

const fixturesRoot = NodeURL.fileURLToPath(new URL("../__fixtures__/", import.meta.url));

const makeTempDir = Effect.fn("makeTempDir")(function* (prefix: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({ directory: fixturesRoot, prefix });
});

/** Write a `recipe.ts` whose body lines are given verbatim (so each test authors its own form). */
const writeRecipe = Effect.fn("writeRecipe")(function* (input: {
  readonly workspaceRoot: string;
  readonly id: string;
  readonly body: ReadonlyArray<string>;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const recipeRoot = path.join(input.workspaceRoot, ".t3team/recipes", input.id);
  yield* fileSystem.makeDirectory(recipeRoot, { recursive: true });
  yield* fileSystem.writeFileString(
    path.join(recipeRoot, "main.workflow.ts"),
    [`export const meta = { name: "${input.id}.workflow" } as const;`, `return { ok: true };`].join(
      "\n",
    ),
  );
  yield* fileSystem.writeFileString(
    path.join(recipeRoot, "recipe.ts"),
    [
      `import { defineRecipe, defineWorkflow } from "@t3team/sdk";`,
      `export default defineRecipe({`,
      `  id: "${input.id}",`,
      `  version: "0.1.0",`,
      ...input.body,
      `  surfaces: ["project.dashboard.backlog"],`,
      `  defaultAction: defineWorkflow("./main.workflow.ts"),`,
      `});`,
    ].join("\n"),
  );
  return recipeRoot;
});

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect.pipe(Effect.provide(NodeServices.layer))));

describe("ctx-derived recipe metadata", () => {
  it("evaluates displayName/icon/rank derivers and visible against the render context", async () => {
    await run(
      Effect.gen(function* () {
        const workspaceRoot = yield* makeTempDir("t3team-recipe-meta-ws-");
        yield* writeRecipe({
          workspaceRoot,
          id: "derived",
          body: [
            "  title: (ctx) => `Create QA plan for ${ctx.workitem?.displayId ?? 'selected work'}`,",
            `  shortDescription: (ctx) => \`Depth: \${ctx.profile.technicalDepth}\`,`,
            `  icon: (ctx) => (ctx.workitem?.type === "Bug" ? "bug" : "clipboard-check"),`,
            `  rank: (ctx) => (ctx.workitem?.priority === "High" ? 90 : 50),`,
            `  visible: (ctx) => ctx.workitem?.provider === "jira",`,
            `  appliesTo: {},`,
          ],
        });

        const discovered = yield* discoverProjectRecipes({
          workspaceRoot,
          context: backlogRenderContext(),
        });
        const recipe = discovered.recipes.find((entry) => entry.id === "derived");
        expect(recipe).toBeDefined();
        expect(recipe?.displayName).toBe("Create QA plan for ALPHA-42");
        expect(recipe?.shortDescription).toBe("Depth: medium");
        expect(recipe?.icon).toBe("bug");
        // The derived rank feeds the same scoring the declarative `rank` fed.
        expect(recipe!.rank).toBeGreaterThanOrEqual(90);
      }),
    );
  });

  it("keeps the declarative form working unchanged", async () => {
    await run(
      Effect.gen(function* () {
        const workspaceRoot = yield* makeTempDir("t3team-recipe-meta-ws-");
        yield* writeRecipe({
          workspaceRoot,
          id: "declarative",
          body: [
            `  title: "Plain title",`,
            `  shortDescription: "Plain description",`,
            `  icon: "clipboard-check",`,
            `  rank: 42,`,
            `  appliesTo: { requiresIntegration: ["jira"], jiraIssueTypes: ["Bug"] },`,
          ],
        });

        const discovered = yield* discoverProjectRecipes({
          workspaceRoot,
          context: backlogRenderContext(),
        });
        const recipe = discovered.recipes.find((entry) => entry.id === "declarative");
        expect(recipe?.displayName).toBe("Plain title");
        expect(recipe?.shortDescription).toBe("Plain description");
        expect(recipe?.icon).toBe("clipboard-check");
        expect(recipe!.rank).toBeGreaterThanOrEqual(42);
      }),
    );
  });

  it("lets visible narrow but never widen the declarative appliesTo gate", async () => {
    await run(
      Effect.gen(function* () {
        const workspaceRoot = yield* makeTempDir("t3team-recipe-meta-ws-");
        // `visible: () => false` hides a recipe `appliesTo` would have allowed → narrowing works.
        yield* writeRecipe({
          workspaceRoot,
          id: "narrowed",
          body: [
            `  title: "Narrowed",`,
            `  shortDescription: "hidden by visible",`,
            `  visible: () => false,`,
            `  appliesTo: {},`,
          ],
        });
        // `visible: () => true` must NOT rescue a recipe `appliesTo` excludes → no widening.
        yield* writeRecipe({
          workspaceRoot,
          id: "still-excluded",
          body: [
            `  title: "Still excluded",`,
            `  shortDescription: "excluded by appliesTo",`,
            `  visible: () => true,`,
            `  appliesTo: { jiraIssueTypes: ["Story"] },`,
          ],
        });
        yield* writeRecipe({
          workspaceRoot,
          id: "kept",
          body: [`  title: "Kept",`, `  shortDescription: "passes both gates",`, `  appliesTo: {},`],
        });

        const discovered = yield* discoverProjectRecipes({
          workspaceRoot,
          context: backlogRenderContext(),
        });
        const ids = discovered.recipes.map((entry) => entry.id);
        expect(ids).toContain("kept");
        expect(ids).not.toContain("narrowed");
        // The render context's workitem type is "Bug", so the Story-only gate still excludes it.
        expect(ids).not.toContain("still-excluded");
      }),
    );
  });

  it("degrades a throwing deriver to 'not visible' without breaking the catalog", async () => {
    await run(
      Effect.gen(function* () {
        const workspaceRoot = yield* makeTempDir("t3team-recipe-meta-ws-");
        yield* writeRecipe({
          workspaceRoot,
          id: "throws-title",
          body: [
            `  title: () => { throw new Error("boom"); },`,
            `  shortDescription: "d",`,
            `  appliesTo: {},`,
          ],
        });
        yield* writeRecipe({
          workspaceRoot,
          id: "throws-visible",
          body: [
            `  title: "T",`,
            `  shortDescription: "d",`,
            `  visible: () => { throw new Error("boom"); },`,
            `  appliesTo: {},`,
          ],
        });
        yield* writeRecipe({
          workspaceRoot,
          id: "healthy",
          body: [`  title: "Healthy",`, `  shortDescription: "d",`, `  appliesTo: {},`],
        });

        const discovered = yield* discoverProjectRecipes({
          workspaceRoot,
          context: backlogRenderContext(),
        });
        const ids = discovered.recipes.map((entry) => entry.id);
        // The two broken recipes are dropped; the healthy sibling still renders.
        expect(ids).toEqual(["healthy"]);
      }),
    );
  });
});
