import { listBundledT3WorkRecipes } from "@t3tools/t3work-skill-packs";

import {
  T3WORK_PROJECT_RECIPES_ROOT,
  type T3WorkProjectSetupFile,
} from "./t3work-projectSetupShared.ts";

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
    ...(recipe.id === "create-recipe" ? { workflow: "./workflow.ts" } : {}),
    allowedToolGroups: recipe.allowedToolGroups,
    outputPreference: recipe.outputPreference,
  });
}

function renderBundledRecipePrompt(
  recipe: ReturnType<typeof listBundledT3WorkRecipes>[number],
): string {
  return `# ${recipe.title}\n\n${recipe.shortDescription}\n\n## Prompt\n\n${recipe.promptTemplate}\n`;
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
    '          "Author recipe.json, prompt.md, workflow.ts, and helper script files when needed.",',
    '          "Use project and ticket context signals to control where the recipe appears.",',
    '          "Build a multi-step workflow when a single kickoff prompt is not enough.",',
    "        ],",
    "        responseInstructions:",
    '          "Describe the recipe goal, target surface, visibility rules, and any setup or workflow steps it should include.",',
    "      },",
    "    },",
    "  },",
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
    "const STARTER_RECIPE_JSON = JSON.stringify(",
    "  {",
    '    id: "example-recipe",',
    '    version: "0.1.0",',
    '    scope: "project",',
    '    displayName: "Example recipe",',
    '    shortDescription: "Describe what the recipe does.",',
    '    surfaces: ["workitem.detail.sidepanel"],',
    '    prompt: "./prompt.md",',
    "  },",
    "  null,",
    "  2,",
    ') + "\\n";',
    "",
    "const STARTER_WORKFLOW_TS = [",
    '  "export const steps = [",',
    '  \"  { kind: \\\"agent\\\", id: \\\"kickoff\\\" },\",',
    '  "];",',
    '  "",',
    '].join("\\n");',
    "",
    "export async function prepareAuthoringWorkspace(_context, api) {",
    '  await api.workspace.writeText("starter/recipe.json", STARTER_RECIPE_JSON);',
    '  await api.workspace.writeText("starter/workflow.ts", STARTER_WORKFLOW_TS);',
    "  await api.workspace.writeText(",
    '    "starter/README.md",',
    "    [",
    '      "Use these starter files as a reference while creating a new recipe under ../<recipe-id>.",',
    '      "Adjust recipe.json, prompt.md, workflow.ts, and any helper scripts to match the user\'s brief.",',
    '    ].join("\\n") + "\\n",',
    "  );",
    "}",
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

    return files;
  });
}
