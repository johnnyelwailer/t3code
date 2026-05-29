import * as Effect from "effect/Effect";
import { CommandId, type EventId, type ThreadId } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH,
  type ProjectRecipeLaunchPhase,
  type ProjectRecipeWorkflowLaunch as ProjectRecipeWorkflowLaunchType,
} from "@t3tools/project-recipes";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import {
  buildLaunchActivityPayload,
  launchActivityId,
  launchSummaryForPhase,
  workflowRunIdForThread,
} from "./t3work-recipeWorkflowRuntimeShared.ts";
import { t3workRandomUUID } from "./t3work-random.ts";

export const upsertThreadActivity = Effect.fn("upsertThreadActivity")(function* (input: {
  orchestration: OrchestrationEngineShape;
  threadId: ThreadId;
  activityId: EventId;
  createdAt: string;
  kind: string;
  summary: string;
  payload: unknown;
  tone?: "info" | "tool" | "approval" | "error";
}) {
  yield* input.orchestration.dispatch({
    type: "thread.activity.append",
    commandId: CommandId.make(`server:t3work:recipe-activity:${t3workRandomUUID()}`),
    threadId: input.threadId,
    activity: {
      id: input.activityId,
      tone: input.tone ?? "info",
      kind: input.kind,
      summary: input.summary,
      payload: input.payload,
      turnId: null,
      createdAt: input.createdAt,
    },
    createdAt: input.createdAt,
  });
});

export const upsertProjectRecipeLaunchActivity = Effect.fn("upsertProjectRecipeLaunchActivity")(
  function* (input: {
    orchestration: OrchestrationEngineShape;
    threadId: ThreadId;
    launch: ProjectRecipeWorkflowLaunchType;
    workflowRunId?: string;
    phase: ProjectRecipeLaunchPhase;
    createdAt: string;
    error?: string;
  }) {
    const workflowRunId = input.workflowRunId ?? workflowRunIdForThread(input.threadId);
    yield* upsertThreadActivity({
      orchestration: input.orchestration,
      threadId: input.threadId,
      activityId: launchActivityId(input.threadId),
      createdAt: input.createdAt,
      kind: PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH,
      summary: launchSummaryForPhase(input.phase, input.launch),
      payload: buildLaunchActivityPayload({
        launch: input.launch,
        workflowRunId,
        phase: input.phase,
        ...(input.error ? { error: input.error } : {}),
      }),
      ...(input.phase === "failed" ? { tone: "error" as const } : {}),
    });
  },
);
