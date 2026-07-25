import { renderEditPluginModuleScript } from "./t3team-projectSetupEditPluginRecipeScript.ts";

export const EDIT_PLUGIN_MODULE_RECIPE_ID = "edit-plugin-module";

export { renderEditPluginModuleScript };

export function renderEditPluginModulePrompt(): string {
  return `# Edit a project-local recipe or plugin module

Write the updated source into the draft artifact path the workflow provides, then reply briefly that the draft is ready.

<!-- Split into ./prompts/edit-recipe.md and ./prompts/edit-section.md if the per-kind guidance needs to diverge further. -->

## shared

- Edit only the single target file.
- Preserve exports, ids, and existing structure unless the request explicitly changes them.
- Keep nearby formatting and relative imports consistent.

## bundled-recipe

- Keep the file authored as createBundledRecipe({ ... kickoff }) when it already uses that shape.
- Do not migrate the file to defineRecipe or another SDK wrapper.
- Preserve recipe ids, surfaces, allowed tool groups, and kickoff structure unless the request changes them.

## recipe-module

- Preserve stable recipe ids, workflow contracts, and referenced file paths unless the change requires them.
- Keep compatibility with existing prompt, workflow, and helper modules.

## section-module

- Preserve section ids, item ids, and menu wiring unless the request explicitly changes them.
- Keep the existing shell and sidecar behavior intact.

## recipe-manifest

- Keep valid JSON.
- Preserve relative prompt, workflow, and helper paths unless the request changes them.

## generic-module

- Make the smallest coherent change that satisfies the request.
`;
}

export function renderEditPluginModuleWorkflow(): string {
  return [
    "export const steps = [",
    "  {",
    '    kind: "collect-input",',
    '    id: "collect-edit-brief",',
    "    request: {",
    '      kind: "text",',
    '      when: "missing-prompt",',
    "      promptRequest: {",
    '        title: "Describe the edit you want",',
    '        body: "Explain the change you want to make. If you did not launch this from Edit this..., include the source file path in the request.",',
    '        sections: ["context-summary", "available-context-keys", "capabilities"],',
    "        capabilities: [",
    '          "Open an existing project-local recipe or plugin module and keep the current shape intact.",',
    '          "Draft the change without touching the source file until you approve it.",',
    '          "Show a diff preview before saving the change back to the workspace.",',
    "        ],",
    "        responseInstructions:",
    '          "Describe the change you want, any constraints to preserve, and any identifiers or structure that must stay stable.",',
    "      },",
    "    },",
    "  },",
    '  { kind: "tool", id: "read-current-view", toolName: "t3team.view.read" },',
    '  { kind: "script", id: "prepare-edit-workspace", module: "./recipe-script.ts#prepareEditWorkspace" },',
    '  { kind: "agent", id: "draft-edit", promptPath: "./draft-prompt.md" },',
    "  {",
    '    kind: "present-message",',
    '    id: "review-edit",',
    "    message: {",
    '      body: "Review the proposed diff below. Approve it to write the change back to the source file.",',
    "      visibleToAgent: false,",
    "    },",
    "  },",
    '  { kind: "script", id: "present-edit-preview", module: "./recipe-script.ts#presentEditPreview" },',
    '  { kind: "collect-input", id: "approve-edit", request: { kind: "card-action", actionId: "approve" } },',
    '  { kind: "script", id: "save-edit", module: "./recipe-script.ts#saveApprovedEdit" },',
    "];",
    "",
  ].join("\n");
}
