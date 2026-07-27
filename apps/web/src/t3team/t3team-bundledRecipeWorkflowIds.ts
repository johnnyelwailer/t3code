/**
 * Which bundled recipes are backed by a scaffolded `workflow.ts`, and which of those the sidecar
 * Quick Start card is allowed to launch that way.
 *
 * These are two different questions and they currently have two different answers, so both sets
 * live here rather than as string literals scattered across the launch paths (they were, and they
 * had already drifted: `t3team-sidecarRecipeLaunch` knew about `edit-plugin-module` while
 * `t3team-sidecarRecipes` only knew about `create-recipe`).
 *
 * A launch that omits `recipePath` gets NO host tools — the launch route derives tool scope from
 * the recipe manifest and fails closed — so a workflow-backed recipe launched without its path
 * runs a body whose tool calls cannot resolve. That is why membership here is load-bearing.
 */

export const T3TEAM_DESCRIPTION_REWRITE_RECIPE_ID = "describe-rewrite";

/** Bundled recipes whose project-setup scaffolding writes a `workflow.ts` next to `recipe.ts`
 * (see `apps/server/src/t3team-projectSetupRecipes.ts`). */
export const WORKFLOW_BACKED_BUNDLED_RECIPE_IDS: ReadonlySet<string> = new Set([
  "create-recipe",
  "edit-plugin-module",
  T3TEAM_DESCRIPTION_REWRITE_RECIPE_ID,
]);

/**
 * The subset a Quick Start card launches as a workflow rather than as a plain kickoff prompt.
 *
 * `edit-plugin-module` is deliberately absent: it ships a `workflow.ts` in the retired
 * `export const steps` union format, which the Epic 25 engine no longer runs, so pointing its
 * Quick Start at that file would replace a working prompt launch with a failing one. Add it here
 * when its scaffolded body is ported, not before.
 */
export const QUICK_START_WORKFLOW_BACKED_BUNDLED_RECIPE_IDS: ReadonlySet<string> = new Set([
  "create-recipe",
  T3TEAM_DESCRIPTION_REWRITE_RECIPE_ID,
]);
