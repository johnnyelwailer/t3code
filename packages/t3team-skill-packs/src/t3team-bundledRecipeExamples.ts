/**
 * The bundled recipes in `recipes.ts` are examples, not product content: only the recipe-authoring
 * entry is offered. Runtime flag `BUNDLED_RECIPE_EXAMPLES` (default off) offers the rest again.
 */
export const PRODUCT_BUNDLED_RECIPE_IDS: ReadonlySet<string> = new Set(["manage-project-recipes"]);

/** Not offered, but the description `Rewrite` control launches `describe-rewrite` by path, so it
 * stays scaffolded. Discovery hides it with the retired ids; the by-path launch does not use it. */
export const FEATURE_BACKING_BUNDLED_RECIPE_IDS: ReadonlySet<string> = new Set([
  "describe-rewrite",
]);

/** The one gate in front of every list of bundled recipes the product offers (quick starts, slash
 * aliases, digest catalog). */
export function offeredBundledRecipes<Recipe extends { readonly id: string }>(
  recipes: ReadonlyArray<Recipe>,
  examplesEnabled: boolean,
): ReadonlyArray<Recipe> {
  return examplesEnabled
    ? recipes
    : recipes.filter((recipe) => PRODUCT_BUNDLED_RECIPE_IDS.has(recipe.id));
}

/** What project setup writes into a project: what is offered, plus the recipes shipped controls need. */
export function scaffoldedBundledRecipes<Recipe extends { readonly id: string }>(
  recipes: ReadonlyArray<Recipe>,
  examplesEnabled: boolean,
): ReadonlyArray<Recipe> {
  return examplesEnabled
    ? recipes
    : recipes.filter(
        (recipe) =>
          PRODUCT_BUNDLED_RECIPE_IDS.has(recipe.id) ||
          FEATURE_BACKING_BUNDLED_RECIPE_IDS.has(recipe.id),
      );
}

/**
 * The 22 bundled recipes retired from the product (all but the two above), frozen. Discovery hides
 * non-pack copies of them while the examples flag is off. Never change this list; a redesigned
 * recipe MUST use a new id, or it would be hidden. The test guards the overlap with the kept ids.
 */
export const RETIRED_BUNDLED_RECIPE_IDS: ReadonlySet<string> = new Set([
  "explain-selected-work",
  "fix-this-bug",
  "implement-this",
  "review-acceptance-criteria",
  "create-qa-test-plan",
  "summarize-project-risk",
  "next-best-task",
  "prioritize-pending-work",
  "focus-needs-my-action",
  "show-only-assigned-to-me",
  "shape-next-backlog-slice",
  "unblock-my-work",
  "stakeholder-update",
  "draft-status-update",
  "technical-implementation-plan",
  "address-linked-pr-feedback",
  "unblock-blocked-ticket",
  "re-scope-ticket-overrun",
  "release-handoff-checklist",
  "prepare-post-merge-closeout",
  "support-escalation-summary",
  "tshirt-size-epic",
]);
