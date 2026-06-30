import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";

export const explainSelectedWorkRecipe: T3workSidecarRecipeQuickStart = {
  id: "explain-selected-work",
  title: "Explain this simply",
  description: "Summarize the selected work with user impact, checks, and open questions.",
  prompt:
    "Explain the selected work in plain language. Cover user impact, what is changing, what needs checking, and any unclear points.",
  composerGuidance: {
    helperText: "Add context or constraints before sending.",
    placeholder: "Optional focus for the explanation…",
  },
};

export const reviewAcceptanceCriteriaRecipe: T3workSidecarRecipeQuickStart = {
  id: "review-acceptance-criteria",
  title: "Review acceptance criteria",
  description: "Call out ambiguity, missing testability notes, and follow-up questions.",
  prompt:
    "Review the acceptance criteria. Return a checklist, ambiguity warnings, missing testability notes, and questions to resolve before implementation or QA.",
};

export const tshirtSizeEpicRecipe: T3workSidecarRecipeQuickStart = {
  id: "tshirt-size-epic",
  title: "T-shirt size this epic",
  description: "Estimate relative size, call out unknowns, and suggest a refinement slice.",
  prompt:
    "T-shirt size this epic. Explain the sizing rationale, major unknowns, and the smallest refinement slice that would reduce risk.",
};

export const shapeBacklogSliceRecipe: T3workSidecarRecipeQuickStart = {
  id: "shape-next-backlog-slice",
  title: "Shape the next backlog slice",
  description: "Propose the next shippable slice with scope boundaries and rationale.",
  prompt:
    "Shape the next backlog slice. Propose scope boundaries, dependencies, and why this slice is the right next move.",
};

export const assignedToMeFilterRecipe: T3workSidecarRecipeQuickStart = {
  id: "show-only-assigned-to-me",
  title: "Assigned to me",
  description: "Narrow the backlog to items assigned to you.",
  prompt: "Filter the backlog to items assigned to me.",
};

export const needsMyActionFilterRecipe: T3workSidecarRecipeQuickStart = {
  id: "focus-needs-my-action",
  title: "Show what needs my action",
  description:
    "Filter the current view to work most likely waiting on you, then rank the next move.",
  prompt:
    "Filter the view to work most likely needing my action, then rank the next concrete move.",
};

export const clearFiltersRecipe: T3workSidecarRecipeQuickStart = {
  id: "clear-filters",
  title: "Clear filters",
  description: "Reset view filters to the default backlog slice.",
  prompt: "Clear active view filters.",
};

export const sidecarStoryFilterRecipes = [
  assignedToMeFilterRecipe,
  needsMyActionFilterRecipe,
  clearFiltersRecipe,
] as const;

export const sidecarStoryQuickActionRecipes = [explainSelectedWorkRecipe] as const;

export const sidecarStoryRefinementRecipes = [
  tshirtSizeEpicRecipe,
  shapeBacklogSliceRecipe,
] as const;

export const sidecarStoryQaRecipes = [reviewAcceptanceCriteriaRecipe] as const;

export const sidecarStoryDefaultCompositionRecipes = [
  ...sidecarStoryFilterRecipes,
  ...sidecarStoryQuickActionRecipes,
  ...sidecarStoryRefinementRecipes,
] as const;

export const sidecarStoryEngineeringCompositionRecipes = [
  assignedToMeFilterRecipe,
  explainSelectedWorkRecipe,
  tshirtSizeEpicRecipe,
  shapeBacklogSliceRecipe,
] as const;

export const sidecarStoryQaCompositionRecipes = [
  assignedToMeFilterRecipe,
  explainSelectedWorkRecipe,
  reviewAcceptanceCriteriaRecipe,
] as const;
