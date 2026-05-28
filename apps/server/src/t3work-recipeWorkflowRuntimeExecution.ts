import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import type { ProjectRecipeWorkflowStep as ProjectRecipeWorkflowStepType } from "@t3tools/project-recipes";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type {
  ExecuteWorkflowStepsResult,
  PresentedWorkflowCardState,
} from "./t3work-recipeWorkflowRuntimeExecutionTypes.ts";
import { executeScriptWorkflowStep } from "./t3work-recipeWorkflowRuntimeScriptStep.ts";
import {
  handleAgentWorkflowStep,
  handleAwaitCardActionWorkflowStep,
  handleCardWorkflowStep,
  handleUnsupportedToolWorkflowStep,
} from "./t3work-recipeWorkflowRuntimeStepHandlers.ts";
import type { PersistedRecipeWorkflowRunState } from "./t3work-recipeWorkflowRuntimeShared.ts";

export const executeWorkflowSteps = Effect.fn("executeWorkflowSteps")(function* (input: {
  orchestration: OrchestrationEngineShape;
  state: PersistedRecipeWorkflowRunState;
  startIndex: number;
  kickoffMessage: string;
  createdAt: string;
  allowKickoffAgentStep: boolean;
}) {
  const pathService = yield* Path.Path;
  let kickoffMessage = input.kickoffMessage;
  let lastPresentedCard: PresentedWorkflowCardState | null = null;
  const recipeBasePath = input.state.recipePath ?? pathService.dirname(input.state.workflowPath);

  for (let index = input.startIndex; index < input.state.steps.length; index += 1) {
    const step = input.state.steps[index] as ProjectRecipeWorkflowStepType;

    switch (step.kind) {
      case "agent": {
        const result = yield* handleAgentWorkflowStep({
          orchestration: input.orchestration,
          state: input.state,
          step,
          createdAt: input.createdAt,
          allowKickoffAgentStep: input.allowKickoffAgentStep,
          recipeBasePath,
          kickoffMessage,
        });
        kickoffMessage = result.kickoffMessage;
        continue;
      }
      case "card":
        lastPresentedCard = yield* handleCardWorkflowStep({
          orchestration: input.orchestration,
          state: input.state,
          step,
          createdAt: input.createdAt,
        });
        continue;
      case "await-card-action": {
        const stateToPersist = yield* handleAwaitCardActionWorkflowStep({
          orchestration: input.orchestration,
          state: input.state,
          step,
          index,
          createdAt: input.createdAt,
          kickoffMessage,
          lastPresentedCard,
        });
        if (stateToPersist) {
          return { kickoffMessage, stateToPersist } satisfies ExecuteWorkflowStepsResult;
        }
        continue;
      }
      case "script": {
        const presentedCard = yield* executeScriptWorkflowStep({
          orchestration: input.orchestration,
          state: input.state,
          step,
          createdAt: input.createdAt,
          recipeBasePath,
        });
        if (presentedCard) {
          lastPresentedCard = presentedCard;
        }
        continue;
      }
      default:
        yield* handleUnsupportedToolWorkflowStep({
          orchestration: input.orchestration,
          state: input.state,
          step,
          createdAt: input.createdAt,
        });
    }
  }

  return { kickoffMessage, stateToPersist: null } satisfies ExecuteWorkflowStepsResult;
});
