import type { PromptRef } from "./t3team-sdk.prompt.ts";
import type { AnyScriptRef, WorkflowRef } from "./t3team-sdk.types.ts";

/**
 * The render context a recipe's ctx-derived metadata receives. Kept STRUCTURAL here on
 * purpose: `@t3tools/project-recipes` owns the real discriminated union, and the SDK must
 * not depend on it — the SDK is the public authoring surface everything else points at.
 * Consumers bind the concrete `ProjectRecipeRenderContext` where they evaluate these.
 */
/**
 * The minimum an author can COUNT on in a `visible`/derived-metadata callback.
 *
 * It stays structural (an index signature) so the real, surface-specific render context from
 * `@t3tools/project-recipes` satisfies it without the SDK depending on that package — the layering
 * runs SDK ← project-recipes, not the reverse. But an index signature alone types every field as
 * `unknown`, which made the specced `requiredContext` + `visible` pairing unwritable: the author
 * declares a context key and then cannot read whether it arrived. `availableContextKeys` is therefore
 * pinned to the query surface the host actually supplies, so
 * `ctx.availableContextKeys.some((key) => key === …)` typechecks — that read is a traced query, which
 * is what keeps discovery cheap (Reactivity rule: declare what you need, never probe).
 */
export type RecipeRenderContextLike = Readonly<Record<string, unknown>> & {
  readonly availableContextKeys: {
    readonly some: (predicate: (key: string) => boolean) => boolean;
  };
};

/** Any action's workflow, regardless of its own `Inputs`/`Outputs`. */
export type AnyWorkflowRef = WorkflowRef<unknown, unknown>;

/**
 * One recipe action: a workflow (structured — steps, result contract, journal) or a prompt.
 * Prefer a workflow; a prompt action is for recipes whose whole job is "open a thread with
 * this instruction".
 */
export type AnyActionRef = AnyWorkflowRef | PromptRef;

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

/**
 * One context key a recipe needs before it can be shown — "say what you need and you'll get it"
 * (Epic 16 §Reactivity rule: a recipe reacts to state by having that state in the render context,
 * never by subscribing or fetching).
 *
 * The locked matcher drops a recipe whose non-optional keys are absent from the render context's
 * `availableContextKeys`, and says so in the match reason. That is a set membership test per recipe —
 * no module import, no tool call, no I/O — which is what keeps discovery cheap on the high-churn
 * surfaces where `visible` must stay synchronous.
 */
export type RecipeContextRequirementSpec = {
  readonly key: string;
  readonly description: string;
  /** Absent keys of an optional requirement do not hide the recipe. */
  readonly optional?: boolean;
};

export type RecipeTechnicalDepth = "low" | "medium" | "high";
export type RecipeBrevity = "short" | "balanced" | "detailed";
export type RecipeGuidanceStyle = "guided" | "balanced" | "expert";
export type RecipeDetailDensity = "guided" | "balanced" | "expert";

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
  /** Context keys this recipe needs; missing non-optional keys hide it (see the type's doc). */
  readonly requiredContext?: ReadonlyArray<RecipeContextRequirementSpec>;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly slashAlias?: string;
  /** Recipe-private scripts (Epic 25 §Scripts): the launching recipe's registration becomes
   * the workflow body's `scripts.*` tree. No global identity — scoped to this recipe. */
  readonly scripts?: Readonly<Record<string, AnyScriptRef>>;
  /** The plain-launch entry: a workflow, or a prompt for prompt-only recipes. */
  readonly defaultAction: WorkflowRef<Inputs, Outputs> | PromptRef;
  /**
   * Additional named actions of the SAME recipe — one recipe id, several workflows/surfaces
   * (`actions: { estimate: defineWorkflow(...) }`). `defaultAction` remains the entry a plain
   * launch uses; a launch naming an action runs that action instead. Every action's
   * resolved workflow is part of the recipe's DECLARED set, which is what execution
   * authorization is bound to — declaring actions adds entries, never a directory. Prompt
   * actions declare no workflow, so they add nothing to that set.
   */
  readonly actions?: Readonly<Record<string, AnyActionRef>>;
  readonly defaults?: Partial<Inputs>;
  readonly Inputs?: Inputs;
  readonly Outputs?: Outputs;
}

export type AnyRecipeRef = RecipeRef<unknown, unknown>;
