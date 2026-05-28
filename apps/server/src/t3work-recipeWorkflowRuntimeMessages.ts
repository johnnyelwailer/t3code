import * as Effect from "effect/Effect";
import { CommandId, type T3workMessageExt, type ThreadId } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD,
  type ProjectRecipeConversationCard,
  type ProjectRecipeWorkflowCardActivityPayload,
  type ProjectRecipeWorkflowCardPhase,
} from "@t3tools/project-recipes";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { workflowMessageId } from "./t3work-recipeWorkflowRuntimeShared.ts";

function buildWorkflowMessageExt(input: {
  workflowRunId: string;
  recipeId: string;
  stepId: string;
  visibleToUser: boolean;
  visibleToAgent: boolean;
  status?: T3workMessageExt["status"];
  attachments?: T3workMessageExt["attachments"];
}): T3workMessageExt {
  return {
    author: {
      kind: "system",
      workflowRunId: input.workflowRunId,
      recipeId: input.recipeId,
      stepId: input.stepId,
    },
    visibleToUser: input.visibleToUser,
    visibleToAgent: input.visibleToAgent,
    ...(input.status ? { status: input.status } : {}),
    ...(input.attachments ? { attachments: [...input.attachments] } : {}),
  };
}

export const upsertWorkflowSystemMessage = Effect.fn("upsertWorkflowSystemMessage")(
  function* (input: {
    orchestration: OrchestrationEngineShape;
    threadId: ThreadId;
    workflowRunId: string;
    recipeId: string;
    stepId: string;
    text: string;
    createdAt: string;
    visibleToUser?: boolean;
    visibleToAgent?: boolean;
    status?: T3workMessageExt["status"];
    attachments?: T3workMessageExt["attachments"];
  }) {
    yield* input.orchestration.dispatch({
      type: "thread.message.upsert",
      commandId: CommandId.make(`server:t3work:message:${crypto.randomUUID()}`),
      threadId: input.threadId,
      message: {
        messageId: workflowMessageId(input.threadId, input.stepId),
        role: "system",
        text: input.text,
        t3workExt: buildWorkflowMessageExt({
          workflowRunId: input.workflowRunId,
          recipeId: input.recipeId,
          stepId: input.stepId,
          visibleToUser: input.visibleToUser ?? true,
          visibleToAgent: input.visibleToAgent ?? false,
          ...(input.status ? { status: input.status } : {}),
          ...(input.attachments ? { attachments: input.attachments } : {}),
        }),
        turnId: null,
        streaming: false,
      },
      createdAt: input.createdAt,
    });
  },
);

export const upsertWorkflowCardSystemMessage = Effect.fn("upsertWorkflowCardSystemMessage")(
  function* (input: {
    orchestration: OrchestrationEngineShape;
    threadId: ThreadId;
    workflowRunId: string;
    recipeId: string;
    stepId: string;
    card: ProjectRecipeConversationCard;
    phase: ProjectRecipeWorkflowCardPhase;
    createdAt: string;
    text?: string;
    awaitingActionId?: string;
    completedActionId?: string;
    visibleToUser?: boolean;
    visibleToAgent?: boolean;
  }) {
    const workflowCard: ProjectRecipeWorkflowCardActivityPayload = {
      workflowRunId: input.workflowRunId,
      stepId: input.stepId,
      phase: input.phase,
      ...(input.awaitingActionId ? { awaitingActionId: input.awaitingActionId } : {}),
      ...(input.completedActionId ? { completedActionId: input.completedActionId } : {}),
      card: input.card,
    };

    yield* upsertWorkflowSystemMessage({
      orchestration: input.orchestration,
      threadId: input.threadId,
      workflowRunId: input.workflowRunId,
      recipeId: input.recipeId,
      stepId: input.stepId,
      text: input.text ?? "",
      createdAt: input.createdAt,
      status:
        input.phase === "completed"
          ? "completed"
          : input.awaitingActionId
            ? "waiting-for-input"
            : "active",
      attachments: [
        {
          kind: "view",
          miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD,
          props: workflowCard,
        },
      ],
      ...(input.visibleToUser !== undefined ? { visibleToUser: input.visibleToUser } : {}),
      ...(input.visibleToAgent !== undefined ? { visibleToAgent: input.visibleToAgent } : {}),
    });
  },
);
