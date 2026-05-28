import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import type { ThreadId } from "@t3tools/contracts";
import type { T3workActionRecipeContext } from "@t3tools/project-context";
import type { ProjectRecipeWorkflowLaunch as ProjectRecipeWorkflowLaunchType } from "@t3tools/project-recipes";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { upsertProjectRecipeLaunchActivity } from "./t3work-recipeWorkflowRuntimeActivities.ts";
import {
  finalizeWorkflowExecution,
  resumeProjectRecipeWorkflowAfterAgentReply,
} from "./t3work-recipeWorkflowRuntimeContinuation.ts";
import { executeWorkflowSteps } from "./t3work-recipeWorkflowRuntimeExecution.ts";
import { normalizeWorkflowLaunch } from "./t3work-recipeWorkflowRuntimeNormalization.ts";
import { materializeRecipeWorkflowRun } from "./t3work-recipeWorkflowRunMaterialization.ts";
import { workflowRunRecipeRootPath } from "./t3work-recipeWorkflowRunPaths.ts";
import { workflowRunIdForThread } from "./t3work-recipeWorkflowRuntimeShared.ts";
import {
  buildInitialWorkflowRunState,
  finalizeImmediateWorkflowLaunch,
  readLaunchPromptText,
  readLaunchWorkflowDocument,
} from "./t3work-recipeWorkflowRuntimeHelpers.ts";
export {
  runDeterministicProjectRecipeWorkflowLaunch,
  type DeterministicRecipeWorkflowLaunchEffect,
  type DeterministicRecipeWorkflowLaunchResult,
} from "./t3work-recipeWorkflowRuntimeDeterministic.ts";
export { submitProjectRecipeCardAction } from "./t3work-recipeWorkflowRuntimeCardAction.ts";

export { upsertProjectRecipeLaunchActivity } from "./t3work-recipeWorkflowRuntimeActivities.ts";
export { resumeProjectRecipeWorkflowAfterAgentReply } from "./t3work-recipeWorkflowRuntimeContinuation.ts";

export const runProjectRecipeWorkflowLaunch = Effect.fn("runProjectRecipeWorkflowLaunch")(
  function* (input: {
    orchestration: OrchestrationEngineShape;
    threadId: ThreadId;
    workspaceRoot: string;
    launch: ProjectRecipeWorkflowLaunchType;
    launchContext?: T3workActionRecipeContext;
    kickoffMessage: string;
    createdAt: string;
  }) {
    const pathService = yield* Path.Path;
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

    const seedPromptText = yield* readLaunchPromptText({
      workspaceRoot: input.workspaceRoot,
      launch,
      fallbackPromptText: input.kickoffMessage,
    });
    const runRootPath = workflowRunRecipeRootPath(pathService, input.workspaceRoot, workflowRunId);

    const workflowDocument = yield* readLaunchWorkflowDocument({
      workspaceRoot: input.workspaceRoot,
      launch,
    });

    const initialState = buildInitialWorkflowRunState({
      threadId: input.threadId,
      workflowRunId,
      workspaceRoot: input.workspaceRoot,
      runRootPath,
      launch,
      ...(input.launchContext ? { launchContext: input.launchContext } : {}),
      kickoffMessage: input.kickoffMessage,
      workflowSteps: [...(launch.kickoff?.steps ?? []), ...workflowDocument.steps],
      updatedAt: input.createdAt,
    });

    yield* materializeRecipeWorkflowRun({
      workspaceRoot: input.workspaceRoot,
      workflowRunId,
      launch,
      promptText: seedPromptText,
      ...(input.launchContext ? { launchContext: input.launchContext } : {}),
      copyRecipeFiles: true,
    });

    if (!launch.workflowPath && !launch.kickoff) {
      return yield* finalizeImmediateWorkflowLaunch({
        orchestration: input.orchestration,
        workspaceRoot: input.workspaceRoot,
        threadId: input.threadId,
        launch,
        workflowRunId,
        createdAt: input.createdAt,
        kickoffMessage: input.kickoffMessage,
        stateSnapshot: initialState,
      });
    }

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
      ...(result.turnStartStepId ? { turnStartStepId: result.turnStartStepId } : {}),
    };
  },
);
