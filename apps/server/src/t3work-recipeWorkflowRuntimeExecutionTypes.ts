import type { ProjectRecipeConversationCard as ProjectRecipeConversationCardType } from "@t3tools/project-recipes";

import type { PersistedRecipeWorkflowRunState } from "./t3work-recipeWorkflowRuntimeShared.ts";

export type PresentedWorkflowCardState = {
  cardId: string;
  activityStepId: string;
  card: ProjectRecipeConversationCardType;
};

export type ExecuteWorkflowStepsResult = {
  kickoffMessage: string;
  stateToPersist: PersistedRecipeWorkflowRunState | null;
  turnStartMessage?: string;
};
