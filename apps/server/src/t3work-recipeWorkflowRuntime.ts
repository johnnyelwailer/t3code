import * as Effect from "effect/Effect";
import type { ThreadId } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD_ACTION,
  type ProjectRecipeWorkflowLaunch as ProjectRecipeWorkflowLaunchType,
} from "@t3tools/project-recipes";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import {
  upsertProjectRecipeLaunchActivity,
  upsertThreadActivity,
} from "./t3work-recipeWorkflowRuntimeActivities.ts";
import {
  finalizeWorkflowExecution,
  resumeProjectRecipeWorkflowAfterAgentReply,
  resolveWorkflowLaunchPhase,
} from "./t3work-recipeWorkflowRuntimeContinuation.ts";
import { executeWorkflowSteps } from "./t3work-recipeWorkflowRuntimeExecution.ts";
import { upsertWorkflowCardSystemMessage } from "./t3work-recipeWorkflowRuntimeMessages.ts";
import { readWorkflowModule } from "./t3work-recipeWorkflowRuntimeModule.ts";
import {
  clearWorkflowState,
  persistWorkflowState,
  readPersistedWorkflowState,
} from "./t3work-recipeWorkflowRuntimeState.ts";
import { normalizeWorkflowLaunch } from "./t3work-recipeWorkflowRuntimeNormalization.ts";
import {
  actionActivityId,
  cardActivityId,
  type PersistedRecipeWorkflowRunState,
  workflowRunIdForThread,
} from "./t3work-recipeWorkflowRuntimeShared.ts";

export { upsertProjectRecipeLaunchActivity } from "./t3work-recipeWorkflowRuntimeActivities.ts";
export { resumeProjectRecipeWorkflowAfterAgentReply } from "./t3work-recipeWorkflowRuntimeContinuation.ts";

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
    const launch = normalizeWorkflowLaunch(input.launch);
    yield* upsertProjectRecipeLaunchActivity({
      orchestration: input.orchestration,
      threadId: input.threadId,
      launch,
      workflowRunId,
      phase: "creating-thread",
      createdAt: input.createdAt,
    });

    if (!launch.workflowPath && !launch.kickoff) {
      yield* upsertProjectRecipeLaunchActivity({
        orchestration: input.orchestration,
        threadId: input.threadId,
        launch,
        workflowRunId,
        phase: "bootstrapping-agent",
        createdAt: input.createdAt,
      });
      yield* clearWorkflowState({
        workspaceRoot: input.workspaceRoot,
        threadId: input.threadId,
      });
      return {
        kickoffMessage: input.kickoffMessage,
        turnStartMessage: input.kickoffMessage,
      };
    }

    const workflowDocument = launch.workflowPath
      ? yield* readWorkflowModule({
          workflowPath: launch.workflowPath,
          workspaceRoot: input.workspaceRoot,
          ...(launch.recipePath ? { recipePath: launch.recipePath } : {}),
        })
      : { steps: [] };

    const initialState: PersistedRecipeWorkflowRunState = {
      version: 1,
      threadId: input.threadId,
      workflowRunId,
      workspaceRoot: input.workspaceRoot,
      ...(launch.workflowPath ? { workflowPath: launch.workflowPath } : {}),
      ...(launch.recipePath ? { recipePath: launch.recipePath } : {}),
      launch,
      kickoffMessage: input.kickoffMessage,
      steps: [...(launch.kickoff?.steps ?? []), ...workflowDocument.steps],
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

    yield* finalizeWorkflowExecution({
      orchestration: input.orchestration,
      workspaceRoot: input.workspaceRoot,
      threadId: input.threadId,
      launch,
      workflowRunId,
      createdAt: input.createdAt,
      result,
    });

    return {
      kickoffMessage: result.kickoffMessage,
      ...(result.turnStartMessage ? { turnStartMessage: result.turnStartMessage } : {}),
    };
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
    if (state.waitingFor.kind !== "card-action") {
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

    yield* upsertWorkflowCardSystemMessage({
      orchestration: input.orchestration,
      threadId: input.threadId,
      workflowRunId: state.workflowRunId,
      recipeId: state.launch.recipeId,
      stepId: state.waitingFor.cardActivityStepId,
      card: state.waitingFor.card,
      phase: "completed",
      createdAt: input.createdAt,
      completedActionId: input.actionId,
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

    yield* finalizeWorkflowExecution({
      orchestration: input.orchestration,
      workspaceRoot: input.workspaceRoot,
      threadId: input.threadId,
      launch: state.launch,
      workflowRunId: state.workflowRunId,
      createdAt: input.createdAt,
      result,
    });

    return result.turnStartMessage ? { turnStartMessage: result.turnStartMessage } : {};
  },
);
