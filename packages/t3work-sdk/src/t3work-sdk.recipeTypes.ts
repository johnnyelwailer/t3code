import type { WorkflowRef } from "./t3work-sdk.types.ts";

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
  readonly title: string;
  readonly shortDescription: string;
  readonly surfaces: ReadonlyArray<string>;
  readonly icon?: string;
  readonly rank?: number;
  readonly appliesTo?: RecipeApplicabilitySpec;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly slashAlias?: string;
  readonly defaultAction: WorkflowRef<Inputs, Outputs>;
  readonly defaults?: Partial<Inputs>;
  readonly Inputs?: Inputs;
  readonly Outputs?: Outputs;
}

export type AnyRecipeRef = RecipeRef<unknown, unknown>;
