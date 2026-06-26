import { listBundledT3WorkRecipes } from "@t3tools/t3work-skill-packs";

import {
  T3WORK_PROJECT_RECIPES_ROOT,
  type T3WorkProjectSetupFile,
} from "./t3work-projectSetupShared.ts";
import {
  EDIT_PLUGIN_MODULE_RECIPE_ID,
  renderEditPluginModulePrompt,
  renderEditPluginModuleScript,
  renderEditPluginModuleWorkflow,
} from "./t3work-projectSetupEditPluginRecipe.ts";
import {
  renderTypedRecipeModuleStarter,
  renderTypedRecipeStarterReadme,
  renderTypedWorkflowModuleStarter,
} from "./t3work-projectSetupRecipeScaffolding.ts";

function jsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderBundledRecipeManifest(
  recipe: ReturnType<typeof listBundledT3WorkRecipes>[number],
): string {
  return jsonFile({
    id: recipe.id,
    version: recipe.version,
    scope: "project",
    displayName: recipe.manifestDisplayName,
    shortDescription: recipe.shortDescription,
    ...(recipe.icon ? { icon: recipe.icon } : {}),
    surfaces: recipe.surfaces,
    prompt: "./prompt.md",
    ...(recipe.id === "create-recipe" || recipe.id === EDIT_PLUGIN_MODULE_RECIPE_ID
      ? { workflow: "./workflow.ts" }
      : {}),
    allowedToolGroups: recipe.allowedToolGroups,
    outputPreference: recipe.outputPreference,
  });
}

function renderBundledRecipePrompt(
  recipe: ReturnType<typeof listBundledT3WorkRecipes>[number],
): string {
  if (recipe.id === EDIT_PLUGIN_MODULE_RECIPE_ID) {
    return renderEditPluginModulePrompt();
  }

  return recipe.promptTemplate
    ? `# ${recipe.title}\n\n${recipe.shortDescription}\n\n## Prompt\n\n${recipe.promptTemplate}\n`
    : `# ${recipe.title}\n\n${recipe.shortDescription}\n\n## Prompt\n\nThis recipe runs as a deterministic workflow and does not require an agent prompt.\n`;
}

function renderCreateRecipeWorkflow(): string {
  return [
    "export const steps = [",
    "  {",
    '    kind: "collect-input",',
    '    id: "collect-recipe-brief",',
    "    request: {",
    '      kind: "text",',
    '      when: "missing-prompt",',
    "      promptRequest: {",
    '        title: "Describe the recipe you want to create",',
    '        body: "Tell the agent what the recipe should help with, where it should appear, which project or ticket signals it should react to, and whether it needs a small setup form before it runs.",',
    '        sections: ["context-summary", "available-context-keys", "capabilities"],',
    "        capabilities: [",
    '          "Create a new recipe under .t3work/recipes/<recipe-id>.",',
    '          "Author recipe.ts, <recipe-id>.workflow.ts, prompt.md, and helper script files when needed.",',
    '          "Use defineRecipe + defineWorkflow so defaultAction and defaults are typed against the workflow contract.",',
    '          "Use project and ticket context signals to control where the recipe appears.",',
    '          "Build a multi-step workflow when a single kickoff prompt is not enough.",',
    "        ],",
    "        responseInstructions:",
    '          "Describe the recipe goal, target surface, visibility rules, and any setup or workflow steps it should include.",',
    "      },",
    "    },",
    "  },",
    '  { kind: "tool", id: "read-current-view", toolName: "t3work.view.read" },',
    "  {",
    '    kind: "script",',
    '    id: "prepare-authoring-workspace",',
    '    module: "./recipe-script.ts#prepareAuthoringWorkspace",',
    "  },",
    '  { kind: "agent", id: "author-recipe" },',
    "  {",
    '    kind: "present-message",',
    '    id: "recipe-ready",',
    "    message: {",
    '      body: "Recipe authoring turn finished. Review the new or updated files under .t3work/recipes and run the flow again if you want another pass.",',
    "      visibleToAgent: false,",
    "    },",
    "  },",
    "];",
    "",
  ].join("\n");
}

function renderCreateRecipeScript(): string {
  return [
    "export async function prepareAuthoringWorkspace(_context, api) {",
    '  await api.workspace.writeText("starter/recipe.ts", STARTER_RECIPE_TS);',
    '  await api.workspace.writeText("starter/example-recipe.workflow.ts", STARTER_WORKFLOW_TS);',
    "  await api.workspace.writeText(",
    '    "starter/README.md",',
    "    STARTER_README,",
    "  );",
    "}",
    "",
    "const STARTER_RECIPE_TS = " + JSON.stringify(renderTypedRecipeModuleStarter()) + ";",
    "",
    "const STARTER_WORKFLOW_TS = " + JSON.stringify(renderTypedWorkflowModuleStarter()) + ";",
    "",
    "const STARTER_README = " + JSON.stringify(renderTypedRecipeStarterReadme()) + ";",
    "",
  ].join("\n");
}

export function renderBundledRecipeSetupFiles(): ReadonlyArray<T3WorkProjectSetupFile> {
  return listBundledT3WorkRecipes().flatMap((recipe) => {
    const files: Array<T3WorkProjectSetupFile> = [
      {
        relativePath: `${T3WORK_PROJECT_RECIPES_ROOT}/${recipe.id}/recipe.json`,
        contents: renderBundledRecipeManifest(recipe),
        writeMode: "if-missing",
      },
      {
        relativePath: `${T3WORK_PROJECT_RECIPES_ROOT}/${recipe.id}/prompt.md`,
        contents: renderBundledRecipePrompt(recipe),
        writeMode: "if-missing",
      },
    ];

    if (recipe.id === "create-recipe") {
      files.push(
        {
          relativePath: `${T3WORK_PROJECT_RECIPES_ROOT}/${recipe.id}/workflow.ts`,
          contents: renderCreateRecipeWorkflow(),
          writeMode: "if-missing",
        },
        {
          relativePath: `${T3WORK_PROJECT_RECIPES_ROOT}/${recipe.id}/recipe-script.ts`,
          contents: renderCreateRecipeScript(),
          writeMode: "if-missing",
        },
      );
    }

    if (recipe.id === EDIT_PLUGIN_MODULE_RECIPE_ID) {
      files.push(
        {
          relativePath: `${T3WORK_PROJECT_RECIPES_ROOT}/${recipe.id}/workflow.ts`,
          contents: renderEditPluginModuleWorkflow(),
          writeMode: "if-missing",
        },
        {
          relativePath: `${T3WORK_PROJECT_RECIPES_ROOT}/${recipe.id}/recipe-script.ts`,
          contents: renderEditPluginModuleScript(),
          writeMode: "if-missing",
        },
      );
    }

    return files;
  });
}
