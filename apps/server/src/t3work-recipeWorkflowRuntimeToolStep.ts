import * as Effect from "effect/Effect";
import type { EventId } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  type ProjectRecipeWorkflowToolStep,
} from "@t3tools/project-recipes";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { upsertThreadActivity } from "./t3work-recipeWorkflowRuntimeActivities.ts";
import type { PersistedRecipeWorkflowRunState } from "./t3work-recipeWorkflowRuntimeShared.ts";
import { T3WORK_MCP_SERVER_NAME, type T3workToolBrokerShape } from "./t3work-toolBroker.ts";

export const executeToolWorkflowStep = Effect.fn("executeToolWorkflowStep")(function* (input: {
  orchestration: OrchestrationEngineShape;
  state: PersistedRecipeWorkflowRunState;
  step: ProjectRecipeWorkflowToolStep;
  activityId: EventId;
  createdAt: string;
  toolBroker: T3workToolBrokerShape;
}) {
  const binding = yield* input.toolBroker.bindSession({ threadId: input.state.threadId });
  if (!binding) {
    yield* upsertThreadActivity({
      orchestration: input.orchestration,
      threadId: input.state.threadId,
      activityId: input.activityId,
      createdAt: input.createdAt,
      kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
      summary: `Workflow tool step ${input.step.id} is not available`,
      payload: {
        workflowRunId: input.state.workflowRunId,
        stepId: input.step.id,
        stepKind: input.step.kind,
        phase: "failed",
        error: `No t3work tool binding is available for '${input.step.toolName}'.`,
      },
      tone: "error",
    });
    return;
  }

  const result = yield* binding.callTool({
    server: T3WORK_MCP_SERVER_NAME,
    tool: input.step.toolName,
    ...(input.step.input ? { arguments: input.step.input } : {}),
  });
  const detail = result.content
    .map((entry: (typeof result.content)[number]) => entry.text.trim())
    .filter(Boolean)
    .join("\n");

  yield* upsertThreadActivity({
    orchestration: input.orchestration,
    threadId: input.state.threadId,
    activityId: input.activityId,
    createdAt: input.createdAt,
    kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
    summary: result.isError
      ? `Workflow tool step ${input.step.id} failed`
      : `Completed tool step ${input.step.id}`,
    payload: {
      workflowRunId: input.state.workflowRunId,
      stepId: input.step.id,
      stepKind: input.step.kind,
      phase: result.isError ? "failed" : "completed",
      ...(detail ? (result.isError ? { error: detail } : { detail }) : {}),
    },
    ...(result.isError ? { tone: "error" as const } : {}),
  });
});
