import * as Schema from "effect/Schema";

import type { ExternalResourceRef } from "@t3tools/project-context";
import { ProjectRecipeKickoffProgram } from "./kickoff.ts";
import { isRecipeSignalPredicateSatisfied, RecipeSignalPredicate } from "./recipePredicates.ts";
import type { RecipeMatchSignals } from "./recipeSignals.ts";
import { RecipeSurface } from "./surface.ts";

export { RecipeSurface };

export const RecipeTechnicalDepth = Schema.Literals(["low", "medium", "high"]);
export type RecipeTechnicalDepth = typeof RecipeTechnicalDepth.Type;

export const RecipeBrevity = Schema.Literals(["short", "balanced", "detailed"]);
export type RecipeBrevity = typeof RecipeBrevity.Type;

export const RecipeGuidanceStyle = Schema.Literals(["guided", "balanced", "expert"]);
export type RecipeGuidanceStyle = typeof RecipeGuidanceStyle.Type;

export const RecipeDetailDensity = Schema.Literals(["guided", "balanced", "expert"]);
export type RecipeDetailDensity = typeof RecipeDetailDensity.Type;

export const RecipeApplicability = Schema.Struct({
  resourceKinds: Schema.optional(Schema.Array(Schema.String)),
  projectSourceKinds: Schema.optional(Schema.Array(Schema.String)),
  requiresIntegration: Schema.optional(Schema.Array(Schema.String)),
  jiraIssueTypes: Schema.optional(Schema.Array(Schema.String)),
  requiredSkillPackIds: Schema.optional(Schema.Array(Schema.String)),
  technicalDepths: Schema.optional(Schema.Array(RecipeTechnicalDepth)),
  brevities: Schema.optional(Schema.Array(RecipeBrevity)),
  guidanceStyles: Schema.optional(Schema.Array(RecipeGuidanceStyle)),
  detailDensities: Schema.optional(Schema.Array(RecipeDetailDensity)),
  // Typed signal predicates for bundled-recipe visibility. Missing signals are not satisfied.
  visiblePredicates: Schema.optional(RecipeSignalPredicate),
});
export type RecipeApplicability = typeof RecipeApplicability.Type;

export const RecipeContextRequirement = Schema.Struct({
  key: Schema.String,
  description: Schema.String,
  optional: Schema.optional(Schema.Boolean),
});
export type RecipeContextRequirement = typeof RecipeContextRequirement.Type;

export const RichOutputPreference = Schema.Literals(["markdown", "blocks", "plan", "comment"]);
export type RichOutputPreference = typeof RichOutputPreference.Type;

export const SkillRef = Schema.Struct({
  id: Schema.String,
  version: Schema.optional(Schema.String),
});
export type SkillRef = typeof SkillRef.Type;

export const RecipeFollowup = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  recipeId: Schema.String,
});
export type RecipeFollowup = typeof RecipeFollowup.Type;

export const Recipe = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  shortDescription: Schema.String,
  surfaces: Schema.Array(RecipeSurface),
  promptTemplate: Schema.optional(Schema.String),
  kickoff: Schema.optional(ProjectRecipeKickoffProgram),
  icon: Schema.optional(Schema.String),
  appliesTo: RecipeApplicability,
  requiredContext: Schema.Array(RecipeContextRequirement),
  skillRef: Schema.optional(SkillRef),
  outputPreference: RichOutputPreference,
  artifactKinds: Schema.optional(Schema.Array(Schema.String)),
  actionFamilies: Schema.optional(Schema.Array(Schema.String)),
  rankHint: Schema.optional(Schema.Number),
  suggestedActions: Schema.optional(Schema.Array(RecipeFollowup)),
});
export type Recipe = typeof Recipe.Type;

export type RecipeProfileContext = {
  readonly technicalDepth: RecipeTechnicalDepth;
  readonly brevity: RecipeBrevity;
  readonly guidanceStyle: RecipeGuidanceStyle;
  readonly detailDensity: RecipeDetailDensity;
  readonly preferredArtifactKinds: ReadonlyArray<string>;
  readonly defaultActionFamilies: ReadonlyArray<string>;
  readonly defaultRecipeWeights: Readonly<Record<string, number>>;
};

export type RecipeMatchInput = {
  readonly activeProject: unknown;
  readonly selectedResource: ExternalResourceRef | null;
  readonly resourceKind: string | null;
  readonly availableIntegrations: ReadonlyArray<string>;
  readonly surface: RecipeSurface;
  readonly jiraIssueType?: string | null;
  readonly enabledSkillPacks: ReadonlyArray<string>;
  readonly profile: RecipeProfileContext;
  readonly availableContextKeys?: ReadonlyArray<string>;
  // Precomputed render-context signals (catalog in recipeSignals.ts).
  readonly signals?: RecipeMatchSignals;
};

export type RecipeMatchResult = {
  readonly recipe: Recipe;
  readonly score: number;
  readonly reason: string;
  readonly missingContext: ReadonlyArray<string>;
};

function readProjectSourceKind(activeProject: unknown): string | null {
  if (typeof activeProject !== "object" || activeProject === null) {
    return null;
  }

  const source = (activeProject as { source?: unknown }).source;
  if (typeof source !== "object" || source === null) {
    return null;
  }

  const provider = (source as { provider?: unknown }).provider;
  return typeof provider === "string" ? provider : null;
}

function readSelectedResourceKind(selectedResource: ExternalResourceRef | null): string | null {
  if (!selectedResource || typeof selectedResource !== "object") {
    return null;
  }

  const kind = (selectedResource as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : null;
}

function hasIntersection(
  left: ReadonlyArray<string> | undefined,
  right: ReadonlyArray<string>,
): boolean {
  if (!left || left.length === 0) {
    return true;
  }

  return left.some((value) => right.includes(value));
}

function hasLiteralMatch<TLiteral extends string>(
  allowed: ReadonlyArray<TLiteral> | undefined,
  current: TLiteral,
): boolean {
  return !allowed || allowed.length === 0 || allowed.includes(current);
}

function getMissingRequiredContext(
  recipe: Recipe,
  availableContextKeys: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> {
  if (!availableContextKeys || availableContextKeys.length === 0) {
    return recipe.requiredContext
      .filter((requirement) => requirement.optional !== true)
      .map((requirement) => requirement.key);
  }

  return recipe.requiredContext
    .filter(
      (requirement) =>
        requirement.optional !== true && !availableContextKeys.includes(requirement.key),
    )
    .map((requirement) => requirement.key);
}

function buildRecipeReason(recipe: Recipe, input: RecipeMatchInput): string {
  const reasons: string[] = [];
  if (
    recipe.actionFamilies &&
    recipe.actionFamilies.some((family) => input.profile.defaultActionFamilies.includes(family))
  ) {
    reasons.push("matches your default action families");
  }
  if (
    recipe.artifactKinds &&
    recipe.artifactKinds.some((kind) => input.profile.preferredArtifactKinds.includes(kind))
  ) {
    reasons.push("fits your preferred artifact types");
  }
  if (
    recipe.appliesTo.requiredSkillPackIds &&
    recipe.appliesTo.requiredSkillPackIds.some((packId) => input.enabledSkillPacks.includes(packId))
  ) {
    reasons.push("enabled by the current skill packs");
  }
  if (
    recipe.appliesTo.jiraIssueTypes &&
    input.jiraIssueType &&
    recipe.appliesTo.jiraIssueTypes.includes(input.jiraIssueType)
  ) {
    reasons.push(`matches ${input.jiraIssueType.toLowerCase()} work`);
  }

  return reasons.join("; ") || "available for this context";
}

function buildRecipeScore(
  recipe: Recipe,
  input: RecipeMatchInput,
  missingContextCount: number,
): number {
  let score = recipe.rankHint ?? 0;
  score += input.profile.defaultRecipeWeights[recipe.id] ?? 0;

  if (recipe.actionFamilies) {
    for (const family of recipe.actionFamilies) {
      if (input.profile.defaultActionFamilies.includes(family)) {
        score += 15;
      }
    }
  }

  if (recipe.artifactKinds) {
    for (const kind of recipe.artifactKinds) {
      if (input.profile.preferredArtifactKinds.includes(kind)) {
        score += 10;
      }
    }
  }

  if (recipe.appliesTo.requiredSkillPackIds) {
    for (const packId of recipe.appliesTo.requiredSkillPackIds) {
      if (input.enabledSkillPacks.includes(packId)) {
        score += 20;
      }
    }
  }

  if (recipe.appliesTo.jiraIssueTypes && input.jiraIssueType) {
    score += recipe.appliesTo.jiraIssueTypes.includes(input.jiraIssueType) ? 10 : 0;
  }

  return score - missingContextCount * 5;
}

export function isRecipeApplicable(recipe: Recipe, input: RecipeMatchInput): boolean {
  if (!recipe.surfaces.includes(input.surface)) {
    return false;
  }

  const resourceKind = input.resourceKind ?? readSelectedResourceKind(input.selectedResource);
  if (
    recipe.appliesTo.resourceKinds &&
    recipe.appliesTo.resourceKinds.length > 0 &&
    (!resourceKind || !recipe.appliesTo.resourceKinds.includes(resourceKind))
  ) {
    return false;
  }

  const projectSourceKind = readProjectSourceKind(input.activeProject);
  if (
    recipe.appliesTo.projectSourceKinds &&
    recipe.appliesTo.projectSourceKinds.length > 0 &&
    (!projectSourceKind || !recipe.appliesTo.projectSourceKinds.includes(projectSourceKind))
  ) {
    return false;
  }

  if (!hasIntersection(recipe.appliesTo.requiresIntegration, input.availableIntegrations)) {
    return false;
  }

  if (
    recipe.appliesTo.requiredSkillPackIds &&
    recipe.appliesTo.requiredSkillPackIds.length > 0 &&
    !recipe.appliesTo.requiredSkillPackIds.some((packId) =>
      input.enabledSkillPacks.includes(packId),
    )
  ) {
    return false;
  }

  if (
    recipe.appliesTo.jiraIssueTypes &&
    recipe.appliesTo.jiraIssueTypes.length > 0 &&
    (!input.jiraIssueType || !recipe.appliesTo.jiraIssueTypes.includes(input.jiraIssueType))
  ) {
    return false;
  }

  if (!isRecipeSignalPredicateSatisfied(recipe.appliesTo.visiblePredicates, input.signals)) {
    return false;
  }

  if (!hasLiteralMatch(recipe.appliesTo.technicalDepths, input.profile.technicalDepth)) {
    return false;
  }
  if (!hasLiteralMatch(recipe.appliesTo.brevities, input.profile.brevity)) {
    return false;
  }
  if (!hasLiteralMatch(recipe.appliesTo.guidanceStyles, input.profile.guidanceStyle)) {
    return false;
  }
  if (!hasLiteralMatch(recipe.appliesTo.detailDensities, input.profile.detailDensity)) {
    return false;
  }

  return true;
}

export function matchRecipes(
  recipes: ReadonlyArray<Recipe>,
  input: RecipeMatchInput,
): ReadonlyArray<RecipeMatchResult> {
  return recipes
    .filter((recipe) => isRecipeApplicable(recipe, input))
    .map((recipe) => {
      const missingContext = getMissingRequiredContext(recipe, input.availableContextKeys);
      return {
        recipe,
        score: buildRecipeScore(recipe, input, missingContext.length),
        reason: buildRecipeReason(recipe, input),
        missingContext,
      } satisfies RecipeMatchResult;
    })
    .toSorted((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return left.recipe.title.localeCompare(right.recipe.title);
    });
}
