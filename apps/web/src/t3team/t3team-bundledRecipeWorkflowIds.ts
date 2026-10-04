/**
 * Which bundled recipes are backed by a scaffolded `workflow.ts`.
 *
 * A launch that omits `recipePath` gets NO host tools — the launch route derives tool scope from
 * the recipe manifest and fails closed — so a workflow-backed recipe launched without its path
 * runs a body whose tool calls cannot resolve. Membership here is load-bearing: only these may be
 * launched as recipe workflows, and only these get local `recipePath`/`workflowPath` attached to
 * their Quick Start card.
 */

export const T3TEAM_DESCRIPTION_REWRITE_RECIPE_ID = "describe-rewrite";

/** Bundled recipes whose project-setup scaffolding writes a `workflow.ts` next to `recipe.ts`
 * (see `apps/server/src/t3team-projectSetupRecipes.ts`). */
export const WORKFLOW_BACKED_BUNDLED_RECIPE_IDS: ReadonlySet<string> = new Set([
  T3TEAM_DESCRIPTION_REWRITE_RECIPE_ID,
]);
