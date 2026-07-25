/**
 * ctx-derived recipe metadata (Epic 16 §Plugin Modules): the spec's authored form is
 *
 *   displayName: (ctx) => `Create QA plan for ${ctx.workitem?.displayId ?? "selected work"}`,
 *   icon: (ctx) => (ctx.workitem?.type === "Bug" ? "bug" : "clipboard-check"),
 *   rank: (ctx) => (ctx.workitem?.priority === "High" ? 90 : 50),
 *   visible: (ctx) => ctx.workitem?.provider === "jira",
 *
 * — "Metadata that used to be a template string is now a plain function of context — fully
 * type-checked, no custom expression language, no `new Function` evaluator." This module evaluates
 * that form where discovery already renders metadata, so the declarative form (plain strings +
 * `appliesTo`) keeps working untouched.
 *
 * Failure isolation is the point (Epic 16 §Discovery and Pre-Launch Rendering: "A recipe whose
 * module fails to load or whose `visible`/metadata throws is dropped from the list — it never
 * breaks the page or the other recipes"). These functions run per discovery call for EVERY recipe,
 * so a thrown deriver degrades that one recipe to "not visible" instead of failing the catalog.
 *
 * `visible` is ANDed with the declarative `appliesTo`/`visiblePredicates` gates — it can narrow
 * what `appliesTo` allows, never widen it (see the caller in
 * {@link ./t3work-projectRecipeDiscoveryModule.ts}).
 */

import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";
import type { AnyRecipeRef, RecipeDerived } from "@t3work/sdk";

/** Rendered metadata for one recipe, or `null` when the recipe must be dropped from the list. */
export type RenderedRecipeMetadata = {
  readonly title: string;
  readonly shortDescription: string;
  readonly icon?: string;
  readonly rank?: number;
};

/** A deriver threw: the recipe is hidden and the reason is reported as a diagnostic. */
export type RecipeMetadataFailure = {
  readonly recipeId: string;
  readonly message: string;
};

export type RecipeMetadataOutcome =
  | { readonly kind: "rendered"; readonly metadata: RenderedRecipeMetadata }
  | { readonly kind: "hidden"; readonly failure?: RecipeMetadataFailure };

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Evaluate a `value | ((ctx) => value)` field. Throws with the field named, for one catch site. */
function derive<T>(
  field: string,
  value: RecipeDerived<T>,
  context: ProjectRecipeRenderContext,
): T {
  if (typeof value !== "function") {
    return value;
  }
  try {
    return (value as (ctx: ProjectRecipeRenderContext) => T)(context);
  } catch (error) {
    throw new Error(`${field} threw: ${errorMessage(error)}`, { cause: error });
  }
}

/**
 * Render `title` / `shortDescription` / `icon` / `rank` and evaluate `visible`, in both the
 * declarative and the functional authoring form.
 */
export function renderRecipeMetadata(
  ref: AnyRecipeRef,
  context: ProjectRecipeRenderContext,
): RecipeMetadataOutcome {
  try {
    if (ref.visible !== undefined) {
      let visible: unknown;
      try {
        visible = ref.visible(context);
      } catch (error) {
        throw new Error(`visible threw: ${errorMessage(error)}`, { cause: error });
      }
      if (visible !== true) {
        return { kind: "hidden" };
      }
    }

    const title = derive("title", ref.title, context);
    const shortDescription = derive("shortDescription", ref.shortDescription, context);
    const icon = ref.icon === undefined ? undefined : derive("icon", ref.icon, context);
    const rank = ref.rank === undefined ? undefined : derive("rank", ref.rank, context);

    if (typeof title !== "string" || typeof shortDescription !== "string") {
      throw new Error("title and shortDescription must derive to strings.");
    }

    return {
      kind: "rendered",
      metadata: {
        title,
        shortDescription,
        ...(typeof icon === "string" ? { icon } : {}),
        ...(typeof rank === "number" && Number.isFinite(rank) ? { rank } : {}),
      },
    };
  } catch (error) {
    return {
      kind: "hidden",
      failure: { recipeId: ref.id, message: errorMessage(error) },
    };
  }
}

/**
 * Best-effort text for surfaces that have NO render context (the agent-facing `t3work.recipe.list`,
 * managed-recipe listings). A ctx deriver cannot be evaluated there, so the recipe id stands in for
 * a derived title rather than inventing a fake context to feed author code.
 */
export function staticRecipeText(value: RecipeDerived<string>, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
