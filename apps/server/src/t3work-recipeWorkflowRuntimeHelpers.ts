import type { ThreadId } from "@t3tools/contracts";
import type { T3workActionRecipeContext } from "@t3tools/project-context";
import type { ProjectRecipeWorkflowLaunch as ProjectRecipeWorkflowLaunchType } from "@t3tools/project-recipes";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { finalizeWorkflowExecution } from "./t3work-recipeWorkflowRuntimeContinuation.ts";
import { readWorkflowModule } from "./t3work-recipeWorkflowRuntimeModule.ts";
import {
  type PersistedRecipeWorkflowRunState,
  resolveWithinRoot,
} from "./t3work-recipeWorkflowRuntimeShared.ts";

export const readLaunchPromptText = Effect.fn("readLaunchPromptText")(function* (input: {
  workspaceRoot: string;
  launch: ProjectRecipeWorkflowLaunchType;
  fallbackPromptText: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;

  if (!input.launch.promptPath || input.launch.promptPath.trim().length === 0) {
    return input.fallbackPromptText;
  }

  const recipeSourcePath =
    input.launch.recipePath ??
    (input.launch.workflowPath
      ? pathService.dirname(input.launch.workflowPath)
      : input.workspaceRoot);
  const promptPath = pathService.isAbsolute(input.launch.promptPath)
    ? input.launch.promptPath
    : resolveWithinRoot(pathService, recipeSourcePath, input.launch.promptPath);

  return yield* fileSystem
    .readFileString(promptPath)
    .pipe(Effect.orElseSucceed(() => input.fallbackPromptText));
});

export function buildInitialWorkflowRunState(input: {
  threadId: ThreadId;
  workflowRunId: string;
  workspaceRoot: string;
  runRootPath: string;
  launch: ProjectRecipeWorkflowLaunchType;
  launchContext?: T3workActionRecipeContext;
  kickoffMessage: string;
  workflowSteps: PersistedRecipeWorkflowRunState["steps"];
  updatedAt: string;
}): PersistedRecipeWorkflowRunState {
  return {
    version: 1,
    threadId: input.threadId,
    workflowRunId: input.workflowRunId,
    workspaceRoot: input.workspaceRoot,
    runRootPath: input.runRootPath,
    ...(input.launch.workflowPath ? { workflowPath: input.launch.workflowPath } : {}),
    ...(input.launch.recipePath ? { recipePath: input.launch.recipePath } : {}),
    ...(input.launchContext ? { launchContext: input.launchContext } : {}),
    launch: input.launch,
    kickoffMessage: input.kickoffMessage,
    steps: input.workflowSteps,
    nextStepIndex: 0,
    updatedAt: input.updatedAt,
  };
}

export function requireCardActionCheckpoint(
  state: PersistedRecipeWorkflowRunState,
  input: {
    cardId: string;
    actionId: string;
  },
): Extract<NonNullable<PersistedRecipeWorkflowRunState["waitingFor"]>, { kind: "card-action" }> {
  if (!state.waitingFor || state.waitingFor.kind !== "card-action") {
    throw new Error("This workflow is not waiting for a card action.");
  }
  if (state.waitingFor.cardId !== input.cardId) {
    throw new Error("This card is not the active workflow checkpoint.");
  }
  if (state.waitingFor.actionId !== input.actionId) {
    throw new Error("This action is not valid for the active workflow checkpoint.");
  }

  return state.waitingFor;
}

export const readLaunchWorkflowDocument = Effect.fn("readLaunchWorkflowDocument")(
  function* (input: { workspaceRoot: string; launch: ProjectRecipeWorkflowLaunchType }) {
    return input.launch.workflowPath
      ? yield* readWorkflowModule({
          workflowPath: input.launch.workflowPath,
          workspaceRoot: input.workspaceRoot,
          ...(input.launch.recipePath ? { recipePath: input.launch.recipePath } : {}),
        })
      : { steps: [] };
  },
);

export const finalizeImmediateWorkflowLaunch = Effect.fn("finalizeImmediateWorkflowLaunch")(
  function* (input: {
    orchestration: OrchestrationEngineShape;
    workspaceRoot: string;
    threadId: ThreadId;
    launch: ProjectRecipeWorkflowLaunchType;
    workflowRunId: string;
    createdAt: string;
    kickoffMessage: string;
    stateSnapshot: PersistedRecipeWorkflowRunState;
  }) {
    const result = {
      kickoffMessage: input.kickoffMessage,
      stateToPersist: null,
      stateSnapshot: input.stateSnapshot,
      turnStartMessage: input.kickoffMessage,
    };

    yield* finalizeWorkflowExecution({
      orchestration: input.orchestration,
      workspaceRoot: input.workspaceRoot,
      threadId: input.threadId,
      launch: input.launch,
      workflowRunId: input.workflowRunId,
      createdAt: input.createdAt,
      result,
    });

    return {
      kickoffMessage: input.kickoffMessage,
      turnStartMessage: input.kickoffMessage,
    };
  },
);

export function buildCardActionResumeResponse(input: {
  launch: ProjectRecipeWorkflowLaunchType;
  turnStartMessage?: string;
  turnStartStepId?: string;
}): {
  launch: ProjectRecipeWorkflowLaunchType;
  turnStartMessage?: string;
  turnStartStepId?: string;
} {
  return {
    launch: input.launch,
    ...(input.turnStartMessage ? { turnStartMessage: input.turnStartMessage } : {}),
    ...(input.turnStartStepId ? { turnStartStepId: input.turnStartStepId } : {}),
  };
}
