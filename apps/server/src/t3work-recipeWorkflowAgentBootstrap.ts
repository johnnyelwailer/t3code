import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type { ThreadId } from "@t3tools/contracts";
import { T3workActionRecipeContext } from "@t3tools/project-context";
import type { ProjectRecipeWorkflowLaunch as ProjectRecipeWorkflowLaunchType } from "@t3tools/project-recipes";

import { upsertWorkflowSystemMessage } from "./t3work-recipeWorkflowRuntimeMessages.ts";
import { workflowRunIdForThread } from "./t3work-recipeWorkflowRuntimeShared.ts";
import {
  buildRecipeWorkflowAgentBootstrapAttachments,
  buildRecipeWorkflowAgentBootstrapText,
} from "./t3work-recipeWorkflowAgentBootstrapContent.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";

const decodeActionRecipeContext = Schema.decodeUnknownEffect(
  Schema.fromJsonString(T3workActionRecipeContext),
);

const readBootstrapFile = Effect.fn("readBootstrapFile")(function* (input: {
  filePath: string;
  fallbackText: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem
    .readFileString(input.filePath)
    .pipe(Effect.orElseSucceed(() => input.fallbackText));
});

export const upsertRecipeWorkflowAgentBootstrapContext = Effect.fn(
  "upsertRecipeWorkflowAgentBootstrapContext",
)(function* (input: {
  orchestration: OrchestrationEngineShape;
  threadId: ThreadId;
  workspaceRoot: string;
  launch: ProjectRecipeWorkflowLaunchType;
  stepId: string;
  createdAt: string;
  agentPromptText: string;
  userPromptText?: string;
}) {
  const pathService = yield* Path.Path;
  const workflowRunId = workflowRunIdForThread(input.threadId);
  const runRootPath = pathService.join(input.workspaceRoot, "runs", workflowRunId, "recipe");
  const renderedPromptText = yield* readBootstrapFile({
    filePath: pathService.join(runRootPath, "prompt.md"),
    fallbackText: input.agentPromptText,
  });
  const contextJson = yield* readBootstrapFile({
    filePath: pathService.join(runRootPath, "context.json"),
    fallbackText: "{}\n",
  });
  const launchContext = yield* decodeActionRecipeContext(contextJson).pipe(
    Effect.orElseSucceed(() => undefined),
  );

  yield* upsertWorkflowSystemMessage({
    orchestration: input.orchestration,
    threadId: input.threadId,
    workflowRunId,
    recipeId: input.launch.recipeId,
    stepId: input.stepId,
    text: buildRecipeWorkflowAgentBootstrapText({
      renderedPromptText,
      agentPromptText: input.agentPromptText,
    }),
    createdAt: input.createdAt,
    visibleToUser: false,
    visibleToAgent: true,
    attachments: buildRecipeWorkflowAgentBootstrapAttachments({
      workflowRunId,
      contextJson,
      ...(launchContext ? { launchContext } : {}),
      createdAt: input.createdAt,
    }),
  });
});
