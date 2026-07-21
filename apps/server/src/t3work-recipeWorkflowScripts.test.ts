/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
// @effect-diagnostics nodeBuiltinImport:off - test harness reads a fixture workspace + temp dir.
/**
 * Recipe-private workflow scripts, end to end (Epic 25 §Scripts):
 *
 *   1. A recipe dir ships `scripts/computeStats.ts` (`export default defineScript({...})`),
 *      a `recipe.ts` registering it via `defineRecipe({ scripts: { computeStats } })`, and a
 *      `.workflow.ts` (capabilities `["script"]`) calling `scripts.computeStats(...)`.
 *   2. Module discovery surfaces the registration as `scriptNames` on the discovered recipe.
 *   3. `resolveRecipeWorkflowScripts` re-materializes the live ScriptRefs at launch.
 *   4. `launchWorkflowRecipe` (the production engine launch) runs the body with those scripts —
 *      the deterministic, journaled `scripts.*` path — and completes with the computed output.
 *
 * Plus the guard rails: no recipe.ts → empty record; a scripts-bearing recipe whose
 * defaultAction is not the launched workflow → loud failure; a path-escaping defaultAction →
 * loud failure (resolveWithinRoot).
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { createQueryable } from "@t3tools/project-context";
import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";
import { type OrchestrationCommand, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { discoverProjectRecipes } from "./t3work-projectRecipeDiscovery.ts";
import { resolveRecipeWorkflowScripts } from "./t3work-recipeWorkflowScripts.ts";
import { launchWorkflowRecipe } from "./t3work-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";

const fixtureRoot = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../__fixtures__",
);
const workspaceRoot = NodeFS.mkdtempSync(
  NodePath.join(fixtureRoot, "t3work-recipe-scripts-workspace-"),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3work-recipe-scripts-"));
afterAll(() => {
  NodeFS.rmSync(workspaceRoot, { recursive: true, force: true });
  NodeFS.rmSync(runsRoot, { recursive: true, force: true });
});

const recipeRoot = NodePath.join(workspaceRoot, ".t3work", "recipes", "estimation-stats");
NodeFS.mkdirSync(NodePath.join(recipeRoot, "scripts"), { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(recipeRoot, "scripts", "computeStats.ts"),
  `
import { Schema } from "effect";
import { defineScript } from "@t3work/sdk";

export const Inputs = Schema.Struct({ ratios: Schema.Array(Schema.Number) });
export const Outputs = Schema.Struct({ median: Schema.Number, p75: Schema.Number });

const percentile = (sorted: ReadonlyArray<number>, p: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
};

export default defineScript({
  inputs: Inputs,
  outputs: Outputs,
  handler: async (args) => {
    const sorted = [...args.ratios].sort((a, b) => a - b);
    return { median: percentile(sorted, 50), p75: percentile(sorted, 75) };
  },
});
`,
);
NodeFS.writeFileSync(
  NodePath.join(recipeRoot, "stats.workflow.ts"),
  `
import { Schema } from "effect";

export const Inputs = Schema.Struct({ ratios: Schema.Array(Schema.Number) });
export const Outputs = Schema.Struct({ median: Schema.Number, p75: Schema.Number });

export const meta = {
  name: "estimation-stats.compute",
  description: "Compute estimate-ratio stats via a recipe-private script.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["script"],
} as const;

const input = Schema.decodeSync(Inputs)(args);
const stats = await scripts.computeStats({ ratios: input.ratios });
return { median: stats.median, p75: stats.p75 };
`,
);
NodeFS.writeFileSync(
  NodePath.join(recipeRoot, "recipe.ts"),
  `
import { defineRecipe, defineWorkflow } from "@t3work/sdk";

import computeStats from "./scripts/computeStats.ts";
import type * as StatsWorkflow from "./stats.workflow.ts";

export default defineRecipe({
  id: "estimation-stats",
  version: "0.1.0",
  title: "Estimation stats",
  shortDescription: "Compute estimate-ratio stats deterministically.",
  surfaces: ["workitem.detail.sidepanel"],
  scripts: { computeStats },
  defaultAction: defineWorkflow<typeof StatsWorkflow>("./stats.workflow.ts"),
});
`,
);

// A second recipe whose scripts-bearing module points its defaultAction OUTSIDE the recipe dir.
// The target file exists (defineWorkflow checks existence at module load); the escape is caught
// later by resolveWithinRoot when the launch resolves recipe ownership. Kept in its own
// workspace so the malformed module cannot disturb the discovery assertions above.
const escapeWorkspaceRoot = NodeFS.mkdtempSync(
  NodePath.join(fixtureRoot, "t3work-recipe-scripts-escape-"),
);
afterAll(() => {
  NodeFS.rmSync(escapeWorkspaceRoot, { recursive: true, force: true });
});
const escapeRecipeRoot = NodePath.join(escapeWorkspaceRoot, ".t3work", "recipes", "escape-recipe");
NodeFS.mkdirSync(escapeRecipeRoot, { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(escapeWorkspaceRoot, "outside.workflow.ts"),
  "export const meta = {};\n",
);
NodeFS.writeFileSync(
  NodePath.join(escapeRecipeRoot, "recipe.ts"),
  `
import { defineRecipe, defineScript, defineWorkflow } from "@t3work/sdk";
import { Schema } from "effect";

const noop = defineScript({
  inputs: Schema.Struct({}),
  outputs: Schema.Struct({}),
  handler: async () => ({}),
});

export default defineRecipe({
  id: "escape-recipe",
  version: "0.1.0",
  title: "Escape",
  shortDescription: "d",
  surfaces: ["workitem.detail.sidepanel"],
  scripts: { noop },
  defaultAction: defineWorkflow("../../../outside.workflow.ts"),
});
`,
);

const workflowPath = NodePath.join(recipeRoot, "stats.workflow.ts");

const renderContext: ProjectRecipeRenderContext = {
  surface: "workitem.detail.sidepanel",
  project: { title: "Project Alpha", provider: "jira" },
  workitem: { kind: "ticket", displayId: "ALPHA-7", type: "Story", provider: "jira" },
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
  availableContextKeys: createQueryable([]),
};

const resolveScripts = (input: {
  readonly recipePath: string | undefined;
  readonly workflowPath: string;
}) =>
  Effect.runPromise(
    Effect.scoped(resolveRecipeWorkflowScripts(input).pipe(Effect.provide(NodeServices.layer))),
  );

describe("recipe workflow scripts (Epic 25 §Scripts)", () => {
  it("discovery surfaces the recipe.ts scripts registration as scriptNames", async () => {
    const discovered = await Effect.runPromise(
      Effect.scoped(
        discoverProjectRecipes({ workspaceRoot, context: renderContext }).pipe(
          Effect.provide(NodeServices.layer),
        ),
      ),
    );
    const recipe = discovered.recipes.find((entry) => entry.id === "estimation-stats");
    expect(recipe).toBeDefined();
    expect(recipe!.scriptNames).toEqual(["computeStats"]);
    expect(recipe!.workflowPath).toBe(workflowPath);
  });

  it("resolves the recipe's ScriptRefs and runs them through the engine's scripts.* path", async () => {
    const scripts = await resolveScripts({ recipePath: recipeRoot, workflowPath });
    expect(Object.keys(scripts)).toEqual(["computeStats"]);
    expect(scripts.computeStats!.kind).toBe("script");

    const registry = makeWorkflowEngineRegistry();
    const dispatched: OrchestrationCommand[] = [];
    let seq = 0;
    let completed: unknown;
    const result = await launchWorkflowRecipe({
      runId: "wf-scripts-run",
      workflowPath,
      args: { ratios: [0.8, 1.0, 1.4, 2.2] },
      scripts,
      runsRoot,
      launchThreadId: "launch-scripts-1",
      projectId: ProjectId.make("proj-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("inst-1"), "model-x"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      dispatch: async (command) => {
        dispatched.push(command);
      },
      newId: () => `id-${(seq += 1)}`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      onComplete: async (output) => {
        completed = output;
      },
    });

    expect(result.status).toBe("completed");
    expect(completed).toEqual({ median: 1.0, p75: 1.4 });
  });

  it("resolves to an empty record when the recipe dir has no recipe.ts or no recipePath is given", async () => {
    const jsonOnlyRecipeRoot = NodePath.join(workspaceRoot, ".t3work", "recipes", "json-only");
    NodeFS.mkdirSync(jsonOnlyRecipeRoot, { recursive: true });
    expect(await resolveScripts({ recipePath: jsonOnlyRecipeRoot, workflowPath })).toEqual({});
    expect(await resolveScripts({ recipePath: undefined, workflowPath })).toEqual({});
  });

  it("fails loudly when a scripts-bearing recipe does not own the launched workflow", async () => {
    const error = await resolveScripts({
      recipePath: recipeRoot,
      workflowPath: NodePath.join(workspaceRoot, "elsewhere.workflow.ts"),
    }).catch((e: unknown) => e);
    expect(String(error)).toMatch(/Scripts are recipe-owned/);
  });

  it("fails loudly when the scripts-bearing recipe's defaultAction escapes the recipe dir", async () => {
    const error = await resolveScripts({
      recipePath: escapeRecipeRoot,
      workflowPath: NodePath.join(escapeWorkspaceRoot, "outside.workflow.ts"),
    }).catch((e: unknown) => e);
    expect(String(error)).toMatch(/invalid defaultAction workflow path/i);
  });
});
