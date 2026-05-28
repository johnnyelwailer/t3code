import { PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD_ACTION } from "@t3tools/project-recipes";
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { finalizeWorkflowExecution } from "./t3work-recipeWorkflowRuntimeContinuation.ts";
import { executeWorkflowSteps } from "./t3work-recipeWorkflowRuntimeExecution.ts";
import {
  buildCardActionResumeResponse,
  requireCardActionCheckpoint,
} from "./t3work-recipeWorkflowRuntimeHelpers.ts";
import { upsertWorkflowCardSystemMessage } from "./t3work-recipeWorkflowRuntimeMessages.ts";
import { readPersistedWorkflowState } from "./t3work-recipeWorkflowRuntimeState.ts";
import { actionActivityId } from "./t3work-recipeWorkflowRuntimeShared.ts";
import { upsertThreadActivity } from "./t3work-recipeWorkflowRuntimeActivities.ts";

export const submitProjectRecipeCardAction = Effect.fn("submitProjectRecipeCardAction")(
  function* (input: {
    orchestration: OrchestrationEngineShape;
    workspaceRoot: string;
    threadId: ThreadId;
    cardId: string;
    actionId: string;
    submit?: Record<string, unknown>;
    createdAt: string;
  }) {
    const state = yield* readPersistedWorkflowState({
      workspaceRoot: input.workspaceRoot,
      threadId: input.threadId,
    });
    if (!state) {
      throw new Error("No pending recipe workflow was found for this thread.");
    }

    const waitingFor = requireCardActionCheckpoint(state, {
      cardId: input.cardId,
      actionId: input.actionId,
    });

    yield* upsertThreadActivity({
      orchestration: input.orchestration,
      threadId: input.threadId,
      activityId: actionActivityId(input.threadId, waitingFor.stepId, input.actionId),
      createdAt: input.createdAt,
      kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD_ACTION,
      summary: `Selected '${input.actionId}' on ${waitingFor.card.title}`,
      payload: {
        workflowRunId: state.workflowRunId,
        stepId: waitingFor.stepId,
        cardId: input.cardId,
        actionId: input.actionId,
        ...(input.submit ? { submit: input.submit } : {}),
      },
    });

    yield* upsertWorkflowCardSystemMessage({
      orchestration: input.orchestration,
      threadId: input.threadId,
      workflowRunId: state.workflowRunId,
      recipeId: state.launch.recipeId,
      stepId: waitingFor.cardActivityStepId,
      card: waitingFor.card,
      phase: "completed",
      createdAt: input.createdAt,
      completedActionId: input.actionId,
    });

    const resumedState = {
      ...state,
      waitingFor: undefined,
      updatedAt: input.createdAt,
    };
    const result = yield* executeWorkflowSteps({
      orchestration: input.orchestration,
      state: resumedState,
      startIndex: state.nextStepIndex,
      kickoffMessage: state.kickoffMessage,
      createdAt: input.createdAt,
      allowKickoffAgentStep: false,
    });

    yield* finalizeWorkflowExecution({
      orchestration: input.orchestration,
      workspaceRoot: input.workspaceRoot,
      threadId: input.threadId,
      launch: state.launch,
      workflowRunId: state.workflowRunId,
      createdAt: input.createdAt,
      result,
    });

    return buildCardActionResumeResponse({
      launch: state.launch,
      ...(result.turnStartMessage ? { turnStartMessage: result.turnStartMessage } : {}),
      ...(result.turnStartStepId ? { turnStartStepId: result.turnStartStepId } : {}),
    });
  },
);
