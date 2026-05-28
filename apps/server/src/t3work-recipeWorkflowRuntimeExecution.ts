import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  type ProjectRecipeWorkflowStep as ProjectRecipeWorkflowStepType,
} from "@t3tools/project-recipes";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { upsertThreadActivity } from "./t3work-recipeWorkflowRuntimeActivities.ts";
import type {
  ExecuteWorkflowStepsResult,
  PresentedWorkflowCardState,
} from "./t3work-recipeWorkflowRuntimeExecutionTypes.ts";
import { executeAgentWorkflowStep } from "./t3work-recipeWorkflowRuntimeAgentStep.ts";
import { executeCollectInputWorkflowStep } from "./t3work-recipeWorkflowRuntimeCollectInputStep.ts";
import {
  upsertWorkflowCardSystemMessage,
  upsertWorkflowSystemMessage,
} from "./t3work-recipeWorkflowRuntimeMessages.ts";
import { executeScriptWorkflowStep } from "./t3work-recipeWorkflowRuntimeScriptStep.ts";
import { executeToolWorkflowStep } from "./t3work-recipeWorkflowRuntimeToolStep.ts";
import {
  stepActivityId,
  type PersistedRecipeWorkflowRunState,
} from "./t3work-recipeWorkflowRuntimeShared.ts";
import {
  NoopT3workToolBroker,
  T3workToolBroker,
  type T3workToolBrokerShape,
} from "./t3work-toolBroker.ts";

function buildStateSnapshot(input: {
  state: PersistedRecipeWorkflowRunState;
  kickoffMessage: string;
  nextStepIndex: number;
  createdAt: string;
}): PersistedRecipeWorkflowRunState {
  return {
    ...input.state,
    kickoffMessage: input.kickoffMessage,
    nextStepIndex: input.nextStepIndex,
    updatedAt: input.createdAt,
  };
}

export const executeWorkflowSteps = Effect.fn("executeWorkflowSteps")(function* (input: {
  orchestration: OrchestrationEngineShape;
  state: PersistedRecipeWorkflowRunState;
  startIndex: number;
  kickoffMessage: string;
  createdAt: string;
  allowKickoffAgentStep: boolean;
}) {
  const pathService = yield* Path.Path;
  const toolBroker = Option.getOrElse(
    yield* Effect.serviceOption(T3workToolBroker),
    () => NoopT3workToolBroker,
  );
  let kickoffMessage = input.kickoffMessage;
  let shouldBootstrapAgent = false;
  let bootstrapStepId: string | undefined;
  let lastPresentedCard: PresentedWorkflowCardState | null = null;
  const recipeSourcePath =
    input.state.recipePath ??
    (input.state.workflowPath
      ? pathService.dirname(input.state.workflowPath)
      : input.state.workspaceRoot);

  for (let index = input.startIndex; index < input.state.steps.length; index += 1) {
    const step = input.state.steps[index] as ProjectRecipeWorkflowStepType;
    const activityId = stepActivityId(input.state.threadId, step.id);

    switch (step.kind) {
      case "agent": {
        const isKickoffAgentStep = input.allowKickoffAgentStep && index === input.startIndex;
        const result = yield* executeAgentWorkflowStep({
          orchestration: input.orchestration,
          state: input.state,
          step,
          stepIndex: index,
          kickoffMessage,
          createdAt: input.createdAt,
          recipeSourcePath,
          waitForReply: !isKickoffAgentStep,
        });
        kickoffMessage = result.kickoffMessage;
        if (isKickoffAgentStep) {
          shouldBootstrapAgent = true;
          bootstrapStepId = step.id;
          continue;
        }
        return result;
      }
      case "present-message": {
        const card = step.message.card;
        if (card) {
          yield* upsertWorkflowCardSystemMessage({
            orchestration: input.orchestration,
            threadId: input.state.threadId,
            workflowRunId: input.state.workflowRunId,
            recipeId: input.state.launch.recipeId,
            stepId: step.id,
            card,
            phase: "presented",
            createdAt: input.createdAt,
            text: step.message.body ?? "",
            ...(step.message.visibleToUser !== undefined
              ? { visibleToUser: step.message.visibleToUser }
              : {}),
            ...(step.message.visibleToAgent !== undefined
              ? { visibleToAgent: step.message.visibleToAgent }
              : {}),
          });
          lastPresentedCard = { cardId: card.id, activityStepId: step.id, card };
        } else {
          yield* upsertWorkflowSystemMessage({
            orchestration: input.orchestration,
            threadId: input.state.threadId,
            workflowRunId: input.state.workflowRunId,
            recipeId: input.state.launch.recipeId,
            stepId: step.id,
            text: step.message.body ?? "",
            createdAt: input.createdAt,
            status: "active",
            ...(step.message.visibleToUser !== undefined
              ? { visibleToUser: step.message.visibleToUser }
              : {}),
            ...(step.message.visibleToAgent !== undefined
              ? { visibleToAgent: step.message.visibleToAgent }
              : {}),
          });
        }

        yield* upsertThreadActivity({
          orchestration: input.orchestration,
          threadId: input.state.threadId,
          activityId,
          createdAt: input.createdAt,
          kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
          summary: "Presented workflow message",
          payload: {
            workflowRunId: input.state.workflowRunId,
            stepId: step.id,
            stepKind: step.kind,
            phase: "completed",
            ...(step.message.body ? { detail: step.message.body } : {}),
          },
        });
        continue;
      }
      case "collect-input": {
        const collectInputResult = yield* executeCollectInputWorkflowStep({
          orchestration: input.orchestration,
          state: { ...input.state, nextStepIndex: index },
          step,
          activityId,
          kickoffMessage,
          createdAt: input.createdAt,
          lastPresentedCard,
        });
        if (collectInputResult) {
          return collectInputResult;
        }
        continue;
      }
      case "script": {
        const presentedCard = yield* executeScriptWorkflowStep({
          orchestration: input.orchestration,
          state: input.state,
          step,
          createdAt: input.createdAt,
          recipeSourcePath,
        });
        if (presentedCard) {
          lastPresentedCard = presentedCard;
        }
        continue;
      }
      case "tool": {
        yield* executeToolWorkflowStep({
          orchestration: input.orchestration,
          state: input.state,
          step,
          activityId,
          createdAt: input.createdAt,
          toolBroker: toolBroker as T3workToolBrokerShape,
        });
        continue;
      }
    }
  }

  const result: ExecuteWorkflowStepsResult = {
    kickoffMessage,
    stateToPersist: null,
    stateSnapshot: buildStateSnapshot({
      state: input.state,
      kickoffMessage,
      nextStepIndex: input.state.steps.length,
      createdAt: input.createdAt,
    }),
    ...(shouldBootstrapAgent ? { turnStartMessage: kickoffMessage } : {}),
    ...(bootstrapStepId ? { turnStartStepId: bootstrapStepId } : {}),
  };
  return result;
});
