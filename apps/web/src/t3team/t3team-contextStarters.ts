/**
 * Contextual starters launch through attached-context sync, which fails for work items outside the
 * launching workspace's index. `CONTEXT_STARTERS` hides them until their redesign: recipe starters
 * on these surfaces and the Chat tab beside a work item. A thread's own composer is not one.
 */
import { DIGEST_CHANGE_REQUEST_RECIPE_SURFACE } from "~/t3team/t3team-digestRecipeLaunch";

const CONTEXT_STARTER_SURFACES: ReadonlySet<string> = new Set([
  "workitem.detail.sidepanel",
  "project.dashboard",
  "project.dashboard.myWork",
  "project.dashboard.backlog",
  DIGEST_CHANGE_REQUEST_RECIPE_SURFACE,
]);

const NONE: ReadonlyArray<never> = [];

export const CONTEXT_STARTER_SECTION_ID = "quick-starts";

export function hidesContextStarters(surface: string, enabled: boolean): boolean {
  return !enabled && CONTEXT_STARTER_SURFACES.has(surface);
}

export function offeredContextStarters<Recipe>(
  recipes: ReadonlyArray<Recipe>,
  surface: string,
  enabled: boolean,
): ReadonlyArray<Recipe> {
  return hidesContextStarters(surface, enabled) ? NONE : recipes;
}
