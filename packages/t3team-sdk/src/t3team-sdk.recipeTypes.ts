import type { AnyScriptRef, WorkflowRef } from "./t3team-sdk.types.ts";

/**
 * The render context a recipe's ctx-derived metadata receives. Kept STRUCTURAL here on
 * purpose: `@t3tools/project-recipes` owns the real discriminated union, and the SDK must
 * not depend on it — the SDK is the public authoring surface everything else points at.
 * Consumers bind the concrete `ProjectRecipeRenderContext` where they evaluate these.
 */
export type RecipeRenderContextLike = Readonly<Record<string, unknown>>;

/** Any action's workflow, regardless of its own `Inputs`/`Outputs`. */
export type AnyWorkflowRef = WorkflowRef<unknown, unknown>;

/**
 * Metadata that is either a plain value or a **pure function of the render context** — the form
 * Epic 16 §Plugin Modules authors (`displayName: (ctx) => …`, `icon: (ctx) => …`,
 * `rank: (ctx) => …`). Both forms are accepted; the declarative one is unchanged.
 *
 * Derivers run once per recipe per discovery call, so they must be synchronous, cheap and
 * side-effect-free (Epic 16 §Pure functions, Proxy-traced reactivity). A deriver that throws
 * degrades that ONE recipe to "not visible"; it never breaks the catalog.
 */
export type RecipeDerived<T, Ctx = RecipeRenderContextLike> = T | ((ctx: Ctx) => T);

/**
 * Epic 16 §Pure functions: `visible: (ctx) => boolean`. Evaluated ALONGSIDE the declarative
 * `appliesTo`/`visiblePredicates` gates — a recipe must satisfy both, so `visible` can only
 * narrow what `appliesTo` already allows, never widen it.
 */
export type RecipeVisiblePredicate<Ctx = RecipeRenderContextLike> = (ctx: Ctx) => boolean;

export type RecipeTechnicalDepth = "low" | "medium" | "high";
export type RecipeBrevity = "short" | "balanced" | "detailed";
export type RecipeGuidanceStyle = "guided" | "balanced" | "expert";
export type RecipeDetailDensity = "guided" | "balanced" | "expert";

export type RecipeSignalScalar = string | number | boolean;

export type RecipeSignalComparisonSpec = {
  readonly signal: string;
  readonly eq?: RecipeSignalScalar;
  readonly neq?: RecipeSignalScalar;
  readonly gt?: number;
  readonly gte?: number;
  readonly lt?: number;
  readonly lte?: number;
};

export type RecipeSignalPredicateSpec =
  | RecipeSignalComparisonSpec
  | { readonly all: ReadonlyArray<RecipeSignalPredicateSpec> }
  | { readonly any: ReadonlyArray<RecipeSignalPredicateSpec> }
  | { readonly not: RecipeSignalPredicateSpec };

export interface RecipeApplicabilitySpec {
  readonly resourceKinds?: ReadonlyArray<string>;
  readonly projectSourceKinds?: ReadonlyArray<string>;
  readonly requiresIntegration?: ReadonlyArray<string>;
  readonly jiraIssueTypes?: ReadonlyArray<string>;
  readonly requiredSkillPackIds?: ReadonlyArray<string>;
  readonly technicalDepths?: ReadonlyArray<RecipeTechnicalDepth>;
  readonly brevities?: ReadonlyArray<RecipeBrevity>;
  readonly guidanceStyles?: ReadonlyArray<RecipeGuidanceStyle>;
  readonly detailDensities?: ReadonlyArray<RecipeDetailDensity>;
  readonly visiblePredicates?: RecipeSignalPredicateSpec;
}

export interface RecipeRef<Inputs = unknown, Outputs = unknown> {
  readonly kind: "recipe";
  readonly id: string;
  readonly version: string;
  readonly scope: "project";
  readonly title: RecipeDerived<string>;
  readonly shortDescription: RecipeDerived<string>;
  readonly surfaces: ReadonlyArray<string>;
  readonly icon?: RecipeDerived<string>;
  readonly rank?: RecipeDerived<number>;
  readonly appliesTo?: RecipeApplicabilitySpec;
  /** Context predicate evaluated together with `appliesTo` — narrowing only. */
  readonly visible?: RecipeVisiblePredicate;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly slashAlias?: string;
  /** Recipe-private scripts (Epic 25 §Scripts): the launching recipe's registration becomes
   * the workflow body's `scripts.*` tree. No global identity — scoped to this recipe. */
  readonly scripts?: Readonly<Record<string, AnyScriptRef>>;
  readonly defaultAction: WorkflowRef<Inputs, Outputs>;
  /**
   * Additional named actions of the SAME recipe — one recipe id, several workflows/surfaces
   * (`actions: { estimate: defineWorkflow(...) }`). `defaultAction` remains the entry a plain
   * launch uses; a launch naming an action runs that action's workflow instead. Every action's
   * resolved workflow is part of the recipe's DECLARED set, which is what execution
   * authorization is bound to — declaring actions adds entries, never a directory.
   */
  readonly actions?: Readonly<Record<string, AnyWorkflowRef>>;
  readonly defaults?: Partial<Inputs>;
  readonly Inputs?: Inputs;
  readonly Outputs?: Outputs;
}

export type AnyRecipeRef = RecipeRef<unknown, unknown>;
