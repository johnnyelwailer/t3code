// @effect-diagnostics nodeBuiltinImport:off - test harness writes a fixture workspace.
/**
 * Proves a PROMPT-only recipe is discovered end to end: a `recipe.ts` whose `defaultAction` is
 * `definePrompt("./prompt.md")` reaches the catalog with its prompt CONTENT in `prompt` and no
 * `workflowPath` — the shape the launcher already consumes, so prompt recipes need no new
 * launcher branch (Epic 16 §One recipe, several actions).
 *
 * Also pins the containment rule: a prompt action's file is resolved with the same
 * `resolveWithinRoot` check as a workflow, because a prompt is read and sent to a model.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as NodePathService from "@effect/platform-node/NodePath";
import * as PathService from "effect/Path";
import { createQueryable } from "@t3tools/project-context";
import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";
import { definePrompt } from "@t3team/sdk";
import { it as effectIt } from "@effect/vitest";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { discoverProjectRecipes } from "./t3team-projectRecipeDiscovery.ts";
import { resolvePromptActionSource } from "./t3team-projectRecipePromptAction.ts";

const fixtureRoot = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../__fixtures__",
);
const workspaceRoot = NodeFS.mkdtempSync(NodePath.join(fixtureRoot, "t3team-prompt-action-"));
afterAll(() => {
  NodeFS.rmSync(workspaceRoot, { recursive: true, force: true });
});

const recipeRoot = NodePath.join(workspaceRoot, ".t3team", "recipes", "explain-selected-work");
NodeFS.mkdirSync(recipeRoot, { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(recipeRoot, "prompt.md"),
  "# Explain selected work\n\nExplain the selected item in plain language.\n",
);
NodeFS.writeFileSync(
  NodePath.join(recipeRoot, "recipe.ts"),
  `
import { definePrompt, defineRecipe } from "@t3team/sdk";

export default defineRecipe({
  id: "explain-selected-work",
  version: "0.1.0",
  title: "Explain selected work",
  shortDescription: "Explain the selected item in plain language.",
  surfaces: ["workitem.detail.sidepanel"],
  defaultAction: definePrompt("./prompt.md"),
});
`,
);

const renderContext: ProjectRecipeRenderContext = {
  surface: "workitem.detail.sidepanel",
  project: { title: "Project Alpha", provider: "jira" },
  workitem: {
    kind: "ticket",
    displayId: "ALPHA-42",
    type: "Bug",
    priority: "High",
    provider: "jira",
  },
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

describe("prompt-action recipe discovery", () => {
  effectIt.effect(
    "discovers a prompt-only recipe.ts with its prompt content and no workflowPath",
    () =>
      Effect.gen(function* () {
        const discovered = yield* Effect.scoped(
          discoverProjectRecipes({ workspaceRoot, context: renderContext }).pipe(
            Effect.provide(NodeServices.layer),
          ),
        );

        const recipe = discovered.recipes.find((entry) => entry.id === "explain-selected-work");
        expect(recipe).toBeDefined();
        expect(recipe?.displayName).toBe("Explain selected work");
        // The prompt FILE is read at discovery, exactly as the retired recipe.json form did.
        expect(recipe?.prompt).toContain("Explain the selected item in plain language.");
        expect(recipe?.promptPath).toBe(NodePath.join(recipeRoot, "prompt.md"));
        // A prompt action declares no workflow, so nothing is added to the executable set.
        expect(recipe?.workflowPath).toBeUndefined();
      }),
  );
});

describe("resolvePromptActionSource", () => {
  const withPathService = <A>(f: (pathService: PathService.Path) => A) =>
    Effect.gen(function* () {
      const pathService = yield* PathService.Path;
      return f(pathService);
    }).pipe(Effect.provide(NodePathService.layer));

  effectIt.effect("resolves a recipe-relative prompt file inside the recipe directory", () =>
    withPathService((pathService) => {
      const resolved = resolvePromptActionSource(
        pathService,
        recipeRoot,
        definePrompt("./prompt.md"),
      );
      expect(resolved.promptPath).toBe(NodePath.join(recipeRoot, "prompt.md"));
      expect(resolved.promptText).toBeUndefined();
    }),
  );

  effectIt.effect("passes inline text through unchanged", () =>
    withPathService((pathService) => {
      const resolved = resolvePromptActionSource(
        pathService,
        recipeRoot,
        definePrompt({ text: "Inline instruction." }),
      );
      expect(resolved.promptText).toBe("Inline instruction.");
      expect(resolved.promptPath).toBeUndefined();
    }),
  );

  // The authoring-time guard blocks absolute paths; this pins the SERVER-side containment check
  // for a ref that escapes with `../`, which `definePrompt` accepts as a legal relative form.
  effectIt.effect("refuses a prompt path that escapes the recipe directory", () =>
    withPathService((pathService) => {
      expect(() =>
        resolvePromptActionSource(pathService, recipeRoot, definePrompt("../../../../etc/passwd")),
      ).toThrow(/resolves outside/);
    }),
  );
});
