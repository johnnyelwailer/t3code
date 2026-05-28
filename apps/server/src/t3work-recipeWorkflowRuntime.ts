import * as Effect from "effect/Effect";
import type { ThreadId } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD_ACTION,
  ProjectRecipeWorkflowCardActivityPayload,
  type ProjectRecipeWorkflowLaunch as ProjectRecipeWorkflowLaunchType,
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD,
} from "@t3tools/project-recipes";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import {
  upsertProjectRecipeLaunchActivity,
  upsertThreadActivity,
} from "./t3work-recipeWorkflowRuntimeActivities.ts";
import { executeWorkflowSteps } from "./t3work-recipeWorkflowRuntimeExecution.ts";
import { readWorkflowModule } from "./t3work-recipeWorkflowRuntimeModule.ts";
import {
  clearWorkflowState,
  persistWorkflowState,
  readPersistedWorkflowState,
} from "./t3work-recipeWorkflowRuntimeState.ts";
import {
  actionActivityId,
  cardActivityId,
  type PersistedRecipeWorkflowRunState,
  workflowRunIdForThread,
} from "./t3work-recipeWorkflowRuntimeShared.ts";

export { upsertProjectRecipeLaunchActivity } from "./t3work-recipeWorkflowRuntimeActivities.ts";

export const runProjectRecipeWorkflowLaunch = Effect.fn("runProjectRecipeWorkflowLaunch")(
  function* (input: {
    orchestration: OrchestrationEngineShape;
    threadId: ThreadId;
    workspaceRoot: string;
    launch: ProjectRecipeWorkflowLaunchType;
    kickoffMessage: string;
    createdAt: string;
  }) {
    const workflowRunId = workflowRunIdForThread(input.threadId);
    yield* upsertProjectRecipeLaunchActivity({
      orchestration: input.orchestration,
      threadId: input.threadId,
      launch: input.launch,
      workflowRunId,
      phase: "creating-thread",
      createdAt: input.createdAt,
    });

    if (!input.launch.workflowPath) {
      yield* clearWorkflowState({
        workspaceRoot: input.workspaceRoot,
        threadId: input.threadId,
      });
      return { kickoffMessage: input.kickoffMessage };
    }

    const workflowDocument = yield* readWorkflowModule({
      workflowPath: input.launch.workflowPath,
      workspaceRoot: input.workspaceRoot,
      ...(input.launch.recipePath ? { recipePath: input.launch.recipePath } : {}),
    });

    const initialState: PersistedRecipeWorkflowRunState = {
      version: 1,
      threadId: input.threadId,
      workflowRunId,
      workspaceRoot: input.workspaceRoot,
      workflowPath: input.launch.workflowPath,
      ...(input.launch.recipePath ? { recipePath: input.launch.recipePath } : {}),
      launch: input.launch,
      kickoffMessage: input.kickoffMessage,
      steps: workflowDocument.steps,
      nextStepIndex: 0,
      updatedAt: input.createdAt,
    };

    const result = yield* executeWorkflowSteps({
      orchestration: input.orchestration,
      state: initialState,
      startIndex: 0,
      kickoffMessage: input.kickoffMessage,
      createdAt: input.createdAt,
      allowKickoffAgentStep: true,
    });

    if (result.stateToPersist) {
      yield* persistWorkflowState(result.stateToPersist);
    } else {
      yield* clearWorkflowState({
        workspaceRoot: input.workspaceRoot,
        threadId: input.threadId,
      });
    }

    return { kickoffMessage: result.kickoffMessage };
  },
);

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

    if (!state.waitingFor) {
      throw new Error("This workflow is not waiting for a card action.");
    }
    if (state.waitingFor.cardId !== input.cardId) {
      throw new Error("This card is not the active workflow checkpoint.");
    }
    if (state.waitingFor.actionId !== input.actionId) {
      throw new Error("This action is not valid for the active workflow checkpoint.");
    }

    yield* upsertThreadActivity({
      orchestration: input.orchestration,
      threadId: input.threadId,
      activityId: actionActivityId(input.threadId, state.waitingFor.stepId, input.actionId),
      createdAt: input.createdAt,
      kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD_ACTION,
      summary: `Selected '${input.actionId}' on ${state.waitingFor.card.title}`,
      payload: {
        workflowRunId: state.workflowRunId,
        stepId: state.waitingFor.stepId,
        cardId: input.cardId,
        actionId: input.actionId,
        ...(input.submit ? { submit: input.submit } : {}),
      },
    });

    yield* upsertThreadActivity({
      orchestration: input.orchestration,
      threadId: input.threadId,
      activityId: cardActivityId(input.threadId, state.waitingFor.cardActivityStepId),
      createdAt: input.createdAt,
      kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD,
      summary: state.waitingFor.card.title,
      payload: {
        workflowRunId: state.workflowRunId,
        stepId: state.waitingFor.cardActivityStepId,
        phase: "completed",
        completedActionId: input.actionId,
        card: state.waitingFor.card,
      } satisfies typeof ProjectRecipeWorkflowCardActivityPayload.Type,
    });

    const resumedState: PersistedRecipeWorkflowRunState = {
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

    if (result.stateToPersist) {
      yield* persistWorkflowState(result.stateToPersist);
    } else {
      yield* clearWorkflowState({
        workspaceRoot: input.workspaceRoot,
        threadId: input.threadId,
      });
    }
  },
);
