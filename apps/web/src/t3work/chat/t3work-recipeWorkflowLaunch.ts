import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";

type RecipeKickoffWorkflow = Extract<T3workKickoffWorkflow, { kind: "recipe" }>;

export function toProjectRecipeWorkflowLaunch(workflow: RecipeKickoffWorkflow) {
  return {
    kind: "recipe" as const,
    recipeId: workflow.recipeId,
    ...(workflow.recipeVersion ? { recipeVersion: workflow.recipeVersion } : {}),
    ...(workflow.parameters ? { parameters: workflow.parameters } : {}),
    ...(workflow.kickoff ? { kickoff: workflow.kickoff } : {}),
    title: workflow.title,
    description: workflow.description,
    source: workflow.source,
    surface: workflow.surface,
    ...(workflow.reason ? { reason: workflow.reason } : {}),
    ...(workflow.recipePath ? { recipePath: workflow.recipePath } : {}),
    ...(workflow.promptPath ? { promptPath: workflow.promptPath } : {}),
    ...(workflow.workflowPath ? { workflowPath: workflow.workflowPath } : {}),
    ...(workflow.allowedToolGroups ? { allowedToolGroups: [...workflow.allowedToolGroups] } : {}),
  };
}

export function canLaunchPendingRecipeWorkflow(input: {
  readonly kickoffPending: boolean | undefined;
  readonly kickoffWorkflow: T3workKickoffWorkflow | undefined;
  readonly hasServerLaunchActivity: boolean;
  readonly hasAttachments: boolean;
}): input is {
  readonly kickoffPending: false;
  readonly kickoffWorkflow: RecipeKickoffWorkflow;
  readonly hasServerLaunchActivity: false;
  readonly hasAttachments: false;
} {
  return (
    input.kickoffPending === false &&
    input.kickoffWorkflow?.kind === "recipe" &&
    !input.hasServerLaunchActivity &&
    !input.hasAttachments
  );
}

export async function launchPendingRecipeWorkflowTurn(input: {
  readonly backend: BackendApi;
  readonly threadId: string;
  readonly kickoffPending: boolean | undefined;
  readonly kickoffWorkflow: T3workKickoffWorkflow | undefined;
  readonly hasServerLaunchActivity: boolean;
  readonly kickoffMessage: string;
  readonly titleSeed: string;
  readonly createdAt: string;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly hasAttachments: boolean;
}): Promise<boolean> {
  if (!canLaunchPendingRecipeWorkflow(input)) {
    return false;
  }

  await input.backend.launchRecipeWorkflow({
    threadId: input.threadId,
    kickoffMessage: input.kickoffMessage,
    titleSeed: input.titleSeed,
    createdAt: input.createdAt,
    modelSelection: {
      instanceId: String(input.modelSelection.instanceId),
      model: input.modelSelection.model,
    },
    runtimeMode: input.runtimeMode,
    interactionMode: input.interactionMode,
    launch: toProjectRecipeWorkflowLaunch(input.kickoffWorkflow),
  });

  return true;
}
