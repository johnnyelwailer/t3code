/**
 * `CONTEXT_STARTERS` hides launches that run through attached-context sync, which fails for work
 * items outside the launching workspace's index. Tool-only recipes (view filters) and pinning stay.
 */
import { getBundledT3TeamRecipe, listBundledT3TeamRecipes } from "@t3tools/t3team-skill-packs";

import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { DIGEST_CHANGE_REQUEST_RECIPE_SURFACE } from "~/t3team/t3team-digestRecipeLaunch";

const CONTEXT_STARTER_SURFACES: ReadonlySet<string> = new Set([
  "workitem.detail.sidepanel",
  "project.dashboard",
  "project.dashboard.myWork",
  "project.dashboard.backlog",
  DIGEST_CHANGE_REQUEST_RECIPE_SURFACE,
]);

export const CONTEXT_STARTER_SECTION_ID = "quick-starts";

function runsWithoutAgent(recipeId: string): boolean {
  const steps = getBundledT3TeamRecipe(recipeId)?.kickoff?.steps ?? [];
  return steps.length > 0 && steps.every((step) => step.kind === "tool");
}

const SURFACES_WITH_AGENTLESS_STARTERS: ReadonlySet<string> = new Set(
  listBundledT3TeamRecipes().flatMap((recipe) =>
    runsWithoutAgent(recipe.id) ? recipe.surfaces : [],
  ),
);

export function hidesContextStarters(surface: string, enabled: boolean): boolean {
  return !enabled && CONTEXT_STARTER_SURFACES.has(surface);
}

export function hidesContextStarterSection(surface: string, enabled: boolean): boolean {
  return hidesContextStarters(surface, enabled) && !SURFACES_WITH_AGENTLESS_STARTERS.has(surface);
}

export function offeredContextStarters<Recipe extends { readonly id: string }>(
  recipes: ReadonlyArray<Recipe>,
  surface: string,
  enabled: boolean,
): ReadonlyArray<Recipe> {
  return hidesContextStarters(surface, enabled)
    ? recipes.filter((recipe) => runsWithoutAgent(recipe.id))
    : recipes;
}

export function offeredAgentContextCapabilities(
  capabilities: AgentContextCapabilities,
  enabled: boolean,
): AgentContextCapabilities {
  return enabled
    ? capabilities
    : {
        ...capabilities,
        actions: capabilities.actions.filter((action) => action.kind !== "add-to-chat"),
      };
}
