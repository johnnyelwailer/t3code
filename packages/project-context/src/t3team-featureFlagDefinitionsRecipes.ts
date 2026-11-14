import type { FeatureFlagDefinition } from "./t3team-featureFlagTypes.ts";

/** Recipes and the workflow tools around them. Launcher and tools are on by default (every pack
 * recipe starts through them); unattended starts and tracker-facing recipes wait for a preset. */
export const RECIPE_FEATURE_FLAG_DEFINITIONS = {
  ORCHESTRATION_RECIPES: {
    group: "Orchestration",
    subgroup: "Recipes",
    label: "Recipes",
    description:
      "Discover and launch project and pack recipes from the composer, quick starts and agent tools. Off: no recipe launches; running workflows continue.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  ORCHESTRATION_RECIPE_TRIGGERS: {
    group: "Orchestration",
    subgroup: "Recipes",
    label: "Recipe triggers",
    description:
      "Recipe triggers start runs on their own when a watched event arrives. Off: recipes start only when someone launches them.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  AGENTS_ORCHESTRATION_TOOLS: {
    group: "Agent",
    subgroup: "Tools",
    label: "Workflow tools",
    description:
      "Agent tools to run, inspect, pause, resume and stop workflows. Off: workflows run only from the app.",
    defaultEnabled: true,
    requiresRestart: false,
  },
  WORKITEM_DELIVERY_RECIPES: {
    group: "Work items",
    subgroup: "Recipes",
    label: "Work-item recipes",
    description:
      "The fix-this-bug and implement-this recipes: added to each project and offered on work items. They are bundled examples, so Bundled recipe examples must be on as well. Off: not added and not listed.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  BUNDLED_RECIPE_EXAMPLES: {
    group: "Orchestration",
    subgroup: "Recipes",
    label: "Bundled recipe examples",
    description:
      "The example recipes compiled into the app, offered as quick starts and slash commands and added to new projects. Off: only Create or edit a recipe is offered; recipes from packs and projects are unaffected.",
    defaultEnabled: false,
    requiresRestart: false,
  },
  CONTEXT_STARTERS: {
    group: "Work items",
    subgroup: "Recipes",
    label: "Context starters and ticket chat",
    description:
      "Recipe starters on work items, project dashboards and digest rows, and the Chat tab beside a work item. Off: hidden until their redesign; plain chats and the composer keep working.",
    defaultEnabled: false,
    requiresRestart: false,
    addedOn: "2026-11-13",
  },
} as const satisfies Record<string, FeatureFlagDefinition>;
