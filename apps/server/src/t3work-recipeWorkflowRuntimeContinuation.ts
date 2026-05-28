import * as Effect from "effect/Effect";
import type { ThreadId } from "@t3tools/contracts";
import type {
  ProjectRecipeLaunchPhase,
  ProjectRecipeWorkflowLaunch as ProjectRecipeWorkflowLaunchType,
} from "@t3tools/project-recipes";

import { upsertProjectRecipeLaunchActivity } from "./t3work-recipeWorkflowRuntimeActivities.ts";
import { executeWorkflowSteps } from "./t3work-recipeWorkflowRuntimeExecution.ts";
import type { ExecuteWorkflowStepsResult } from "./t3work-recipeWorkflowRuntimeExecutionTypes.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import {
  clearWorkflowState,
  persistWorkflowState,
  readPersistedWorkflowState,
} from "./t3work-recipeWorkflowRuntimeState.ts";
import type { PersistedRecipeWorkflowRunState } from "./t3work-recipeWorkflowRuntimeShared.ts";

export function resolveWorkflowLaunchPhase(input: {
  stateToPersist: ExecuteWorkflowStepsResult["stateToPersist"];
  turnStartMessage?: string;
}): ProjectRecipeLaunchPhase {
  if (input.stateToPersist?.waitingFor?.kind === "card-action") {
    return "waiting-for-input";
  }
  if (input.stateToPersist?.waitingFor?.kind === "agent-message") {
    return "running";
  }
  if (input.turnStartMessage) {
    return "bootstrapping-agent";
  }
  if (input.stateToPersist) {
    return "running";
  }
  return "completed";
}

export const finalizeWorkflowExecution = Effect.fn("finalizeWorkflowExecution")(function* (input: {
  orchestration: OrchestrationEngineShape;
  workspaceRoot: string;
  threadId: ThreadId;
  launch: ProjectRecipeWorkflowLaunchType;
  workflowRunId: string;
  createdAt: string;
  result: ExecuteWorkflowStepsResult;
}) {
  if (input.result.stateToPersist) {
    yield* persistWorkflowState(input.result.stateToPersist);
  } else {
    yield* clearWorkflowState({
      workspaceRoot: input.workspaceRoot,
      threadId: input.threadId,
    });
  }

  yield* upsertProjectRecipeLaunchActivity({
    orchestration: input.orchestration,
    threadId: input.threadId,
    launch: input.launch,
    workflowRunId: input.workflowRunId,
    phase: resolveWorkflowLaunchPhase(input.result),
    createdAt: input.createdAt,
  });

  return input.result;
});

export const resumeProjectRecipeWorkflowAfterAgentReply = Effect.fn(
  "resumeProjectRecipeWorkflowAfterAgentReply",
)(function* (input: {
  orchestration: OrchestrationEngineShape;
  workspaceRoot: string;
  threadId: ThreadId;
  messageText: string;
  createdAt: string;
}) {
  const state = yield* readPersistedWorkflowState({
    workspaceRoot: input.workspaceRoot,
    threadId: input.threadId,
  });
  if (!state || state.waitingFor?.kind !== "agent-message") {
    return null;
  }

  const resumedState: PersistedRecipeWorkflowRunState = {
    ...state,
    kickoffMessage: input.messageText,
    waitingFor: undefined,
    updatedAt: input.createdAt,
  };
  const result = yield* executeWorkflowSteps({
    orchestration: input.orchestration,
    state: resumedState,
    startIndex: state.nextStepIndex,
    kickoffMessage: input.messageText,
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

  return result;
});
