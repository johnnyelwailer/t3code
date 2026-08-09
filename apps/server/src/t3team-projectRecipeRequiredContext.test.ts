// @effect-diagnostics nodeBuiltinImport:off - test harness writes a fixture workspace.
/**
 * Proves the typed recipe form can use the specced "say what you need and you'll get it" path:
 * `defineRecipe({ requiredContext: [{ key }] })` now reaches the locked matcher (it used to be
 * hardcoded to `[]` for modules), which compares the declared keys against the render context's
 * `availableContextKeys`.
 *
 * The matcher REPORTS rather than excludes: a missing non-optional key costs 5 rank and lands in
 * `missingContext`. That is deliberate and must stay — the bundled recipes declare
 * `requiredContext: [{ key: "project.summary" }]`, so excluding on a missing key would silently hide
 * shipped recipes. So these tests assert the ranking effect, not disappearance.
 *
 * Why this shape and not a workspace-reading gate: `visible` must stay pure and SYNCHRONOUS on the
 * high-churn surfaces these recipes target (Epic 16 §Pure functions — a Promise there is an authoring
 * error), and the Reactivity rule says a recipe gets data by having it in the render context, never
 * by fetching it. This is a set-membership test per recipe: no module import, no tool call, no I/O.
 *
 * Fixtures live under `apps/server/__fixtures__` — inside this repo, so a typed module importing
 * `@t3team/sdk` resolves under `vp test`, where vite owns module resolution.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { createQueryable } from "@t3tools/project-context";
import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";
import { it as effectIt } from "@effect/vitest";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { discoverProjectRecipes } from "./t3team-projectRecipeDiscovery.ts";

const fixtureRoot = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../__fixtures__",
);

const contextWithKeys = (keys: ReadonlyArray<string>): ProjectRecipeRenderContext =>
  ({
    surface: "project.dashboard.backlog",
    project: { title: "Project Alpha", provider: "jira" },
    linkedResources: createQueryable([]),
    artifacts: createQueryable([]),
    profile: {
      technicalDepth: "medium",
      brevity: "balanced",
      guidanceStyle: "guided",
      detailDensity: "balanced",
      preferredArtifactKinds: [],
      defaultActionFamilies: [],
      defaultRecipeWeights: {},
    },
    enabledSkillPacks: [],
    schema: {},
    availableContextKeys: createQueryable([...keys]),
  }) as ProjectRecipeRenderContext;

const roots: string[] = [];
const makeWorkspaceWithRecipe = (requiredContextLine: string): string => {
  const root = NodeFS.mkdtempSync(NodePath.join(fixtureRoot, "t3team-reqctx-"));
  roots.push(root);
  const recipeRoot = NodePath.join(root, ".t3team", "recipes", "needs-deploy-context");
  NodeFS.mkdirSync(recipeRoot, { recursive: true });
  NodeFS.writeFileSync(NodePath.join(recipeRoot, "prompt.md"), "Explain the deployment.\n");
  NodeFS.writeFileSync(
    NodePath.join(recipeRoot, "recipe.ts"),
    [
      `import { definePrompt, defineRecipe } from "@t3team/sdk";`,
      `export default defineRecipe({`,
      `  id: "needs-deploy-context",`,
      `  version: "0.1.0",`,
      `  scope: "project",`,
      `  title: "Deployment erklaeren",`,
      `  shortDescription: "Braucht Deployment-Kontext.",`,
      `  surfaces: ["project.dashboard.backlog"],`,
      requiredContextLine,
      `  defaultAction: definePrompt("./prompt.md"),`,
      `});`,
    ].join("\n"),
  );
  return root;
};
afterAll(() => {
  for (const root of roots) NodeFS.rmSync(root, { recursive: true, force: true });
});

const discover = (workspaceRoot: string, keys: ReadonlyArray<string>) =>
  Effect.scoped(
    discoverProjectRecipes({ workspaceRoot, context: contextWithKeys(keys) }).pipe(
      Effect.provide(NodeServices.layer),
    ),
  );

const REQUIRED = `  requiredContext: [{ key: "deploy.topology", description: "Deployment topology" }],`;

const rankOf = (requiredContextLine: string, keys: ReadonlyArray<string>) =>
  discover(makeWorkspaceWithRecipe(requiredContextLine), keys).pipe(
    Effect.map(
      (discovered) => discovered.recipes.find((entry) => entry.id === "needs-deploy-context")?.rank,
    ),
  );

describe("defineRecipe requiredContext", () => {
  effectIt.effect(
    "costs the recipe rank while a declared key is unavailable, and stops costing once supplied",
    () =>
      Effect.gen(function* () {
        const withoutKey = yield* rankOf(REQUIRED, ["project.summary"]);
        const withKey = yield* rankOf(REQUIRED, ["project.summary", "deploy.topology"]);
        expect(withoutKey).toBeDefined();
        expect(withKey).toBeDefined();
        // Proves the declaration reached the matcher at all: hardcoded `[]` scored both identically.
        expect(withKey! - withoutKey!).toBe(5);
      }),
  );

  effectIt.effect("still shows the recipe — the matcher reports, it does not exclude", () =>
    Effect.gen(function* () {
      const discovered = yield* discover(makeWorkspaceWithRecipe(REQUIRED), ["project.summary"]);
      const recipe = discovered.recipes.find((entry) => entry.id === "needs-deploy-context");
      expect(recipe).toBeDefined();
      expect(recipe?.displayName).toBe("Deployment erklaeren");
    }),
  );

  effectIt.effect("an optional requirement costs nothing", () =>
    Effect.gen(function* () {
      const optional = `  requiredContext: [{ key: "deploy.topology", description: "Deployment topology", optional: true }],`;
      const withoutKey = yield* rankOf(optional, ["project.summary"]);
      const withKey = yield* rankOf(optional, ["project.summary", "deploy.topology"]);
      expect(withoutKey).toBe(withKey);
    }),
  );

  effectIt.effect("declaring nothing keeps the previous behaviour", () =>
    Effect.gen(function* () {
      const discovered = yield* discover(makeWorkspaceWithRecipe(`  rank: 50,`), []);
      expect(discovered.recipes.find((entry) => entry.id === "needs-deploy-context")).toBeDefined();
    }),
  );
});
