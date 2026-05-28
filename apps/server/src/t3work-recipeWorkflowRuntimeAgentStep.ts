import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  type ProjectRecipeWorkflowAgentStep,
} from "@t3tools/project-recipes";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { upsertThreadActivity } from "./t3work-recipeWorkflowRuntimeActivities.ts";
import type { ExecuteWorkflowStepsResult } from "./t3work-recipeWorkflowRuntimeExecutionTypes.ts";
import {
  resolveWithinRoot,
  stepActivityId,
  type PersistedRecipeWorkflowRunState,
} from "./t3work-recipeWorkflowRuntimeShared.ts";

export const executeAgentWorkflowStep = Effect.fn("executeAgentWorkflowStep")(function* (input: {
  orchestration: OrchestrationEngineShape;
  state: PersistedRecipeWorkflowRunState;
  step: ProjectRecipeWorkflowAgentStep;
  stepIndex: number;
  kickoffMessage: string;
  createdAt: string;
  recipeSourcePath: string;
  waitForReply: boolean;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  let kickoffMessage = input.kickoffMessage;

  if (typeof input.step.promptText === "string" && input.step.promptText.trim().length > 0) {
    kickoffMessage = input.step.promptText;
  } else if (typeof input.step.promptPath === "string" && input.step.promptPath.trim().length > 0) {
    const runPromptPath = resolveWithinRoot(
      pathService,
      input.state.runRootPath,
      input.step.promptPath,
    );
    const promptPath = (yield* fileSystem
      .exists(runPromptPath)
      .pipe(Effect.orElseSucceed(() => false)))
      ? runPromptPath
      : resolveWithinRoot(pathService, input.recipeSourcePath, input.step.promptPath);
    kickoffMessage = yield* fileSystem.readFileString(promptPath);
  }

  const hasRemainingSteps = input.stepIndex < input.state.steps.length - 1;
  const shouldWaitForReply = input.waitForReply && hasRemainingSteps;
  const activityId = stepActivityId(input.state.threadId, input.step.id);

  yield* upsertThreadActivity({
    orchestration: input.orchestration,
    threadId: input.state.threadId,
    activityId,
    createdAt: input.createdAt,
    kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
    summary: shouldWaitForReply
      ? "Waiting for workflow agent step"
      : "Prepared workflow agent step",
    payload: {
      workflowRunId: input.state.workflowRunId,
      stepId: input.step.id,
      stepKind: input.step.kind,
      phase: shouldWaitForReply ? "waiting" : "completed",
      detail: shouldWaitForReply
        ? "The workflow is waiting for the agent response."
        : "The workflow prepared an agent turn.",
    },
  });

  const stateSnapshot: PersistedRecipeWorkflowRunState = shouldWaitForReply
    ? {
        ...input.state,
        kickoffMessage,
        nextStepIndex: input.stepIndex + 1,
        waitingFor: {
          kind: "agent-message",
          stepId: input.step.id,
        },
        updatedAt: input.createdAt,
      }
    : {
        ...input.state,
        kickoffMessage,
        nextStepIndex: input.stepIndex + 1,
        updatedAt: input.createdAt,
      };

  const result: ExecuteWorkflowStepsResult = {
    kickoffMessage,
    stateToPersist: shouldWaitForReply ? stateSnapshot : null,
    stateSnapshot,
    turnStartMessage: kickoffMessage,
    turnStartStepId: input.step.id,
  };
  return result;
});
