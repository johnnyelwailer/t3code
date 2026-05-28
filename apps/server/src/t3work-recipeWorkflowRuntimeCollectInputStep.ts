import * as Effect from "effect/Effect";
import type { EventId } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  type ProjectRecipeWorkflowCollectInputStep,
} from "@t3tools/project-recipes";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { upsertWorkflowCardSystemMessage } from "./t3work-recipeWorkflowRuntimeMessages.ts";
import { upsertThreadActivity } from "./t3work-recipeWorkflowRuntimeActivities.ts";
import type {
  ExecuteWorkflowStepsResult,
  PresentedWorkflowCardState,
} from "./t3work-recipeWorkflowRuntimeExecutionTypes.ts";
import { type PersistedRecipeWorkflowRunState } from "./t3work-recipeWorkflowRuntimeShared.ts";

export const executeCollectInputWorkflowStep = Effect.fn("executeCollectInputWorkflowStep")(
  function* (input: {
    orchestration: OrchestrationEngineShape;
    state: PersistedRecipeWorkflowRunState;
    step: ProjectRecipeWorkflowCollectInputStep;
    activityId: EventId;
    kickoffMessage: string;
    createdAt: string;
    lastPresentedCard: PresentedWorkflowCardState | null;
  }) {
    const { state, step } = input;

    if (step.request.kind === "text") {
      if (step.request.when !== "always" && input.kickoffMessage.trim().length > 0) {
        yield* upsertThreadActivity({
          orchestration: input.orchestration,
          threadId: state.threadId,
          activityId: input.activityId,
          createdAt: input.createdAt,
          kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
          summary: "Satisfied text input request",
          payload: {
            workflowRunId: state.workflowRunId,
            stepId: step.id,
            stepKind: step.kind,
            phase: "completed",
            detail: "Launch input was already provided.",
          },
        });
        return null;
      }

      yield* upsertThreadActivity({
        orchestration: input.orchestration,
        threadId: state.threadId,
        activityId: input.activityId,
        createdAt: input.createdAt,
        kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
        summary: "Workflow text input is not available after launch",
        payload: {
          workflowRunId: state.workflowRunId,
          stepId: step.id,
          stepKind: step.kind,
          phase: "failed",
          error: "Text collect-input is only supported before launch in this phase.",
        },
        tone: "error",
      });
      return null;
    }

    if (!input.lastPresentedCard) {
      yield* upsertThreadActivity({
        orchestration: input.orchestration,
        threadId: state.threadId,
        activityId: input.activityId,
        createdAt: input.createdAt,
        kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
        summary: "Workflow is missing a card to await",
        payload: {
          workflowRunId: state.workflowRunId,
          stepId: step.id,
          stepKind: step.kind,
          phase: "failed",
          error: "collect-input card-action requires a preceding present-message card.",
        },
        tone: "error",
      });
      return null;
    }

    yield* upsertWorkflowCardSystemMessage({
      orchestration: input.orchestration,
      threadId: state.threadId,
      workflowRunId: state.workflowRunId,
      recipeId: state.launch.recipeId,
      stepId: input.lastPresentedCard.activityStepId,
      card: input.lastPresentedCard.card,
      phase: "updated",
      createdAt: input.createdAt,
      awaitingActionId: step.request.actionId,
    });

    yield* upsertThreadActivity({
      orchestration: input.orchestration,
      threadId: state.threadId,
      activityId: input.activityId,
      createdAt: input.createdAt,
      kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
      summary: "Waiting for card action",
      payload: {
        workflowRunId: state.workflowRunId,
        stepId: step.id,
        stepKind: step.kind,
        phase: "waiting",
        detail: `Waiting for '${step.request.actionId}'.`,
      },
    });

    const result: ExecuteWorkflowStepsResult = {
      kickoffMessage: input.kickoffMessage,
      stateToPersist: {
        ...state,
        kickoffMessage: input.kickoffMessage,
        nextStepIndex: state.nextStepIndex + 1,
        waitingFor: {
          kind: "card-action",
          stepId: step.id,
          cardId: input.lastPresentedCard.cardId,
          cardActivityStepId: input.lastPresentedCard.activityStepId,
          actionId: step.request.actionId,
          card: input.lastPresentedCard.card,
        },
        updatedAt: input.createdAt,
      },
      stateSnapshot: {
        ...state,
        kickoffMessage: input.kickoffMessage,
        nextStepIndex: state.nextStepIndex + 1,
        waitingFor: {
          kind: "card-action",
          stepId: step.id,
          cardId: input.lastPresentedCard.cardId,
          cardActivityStepId: input.lastPresentedCard.activityStepId,
          actionId: step.request.actionId,
          card: input.lastPresentedCard.card,
        },
        updatedAt: input.createdAt,
      },
    };
    return result;
  },
);
