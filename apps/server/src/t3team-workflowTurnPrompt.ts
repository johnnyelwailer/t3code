/**
 * The prompt message of a workflow `askAgent` step on V2.
 *
 * The step's prompt is a `user`-role message the host dispatches (queued behind any active run);
 * the run it starts is the run whose end answers the step. Each attempt (the first ask, every
 * re-drive) posts its own prompt with a fresh id, stamped with the step's workflow author in the
 * message context — so after a restart the step's current prompt is found again by that stamp,
 * the same way a client attributes and collapses it.
 */
import {
  type OrchestrationMessageContext,
  type OrchestrationV2ConversationMessage,
  readT3TeamMessageExtContext,
  type T3TeamMessageAuthor,
  type T3TeamMessageWorkflowAuthor,
  withT3TeamMessageExtContext,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { t3teamRandomUUID } from "./t3team-random.ts";

/** The context a workflow prompt carries: its author stamp, unreferenced (never sent to the agent). */
export const workflowPromptContext = (
  author: T3TeamMessageAuthor,
): OrchestrationMessageContext | undefined => withT3TeamMessageExtContext({ author });

/** A fresh prompt message id for one attempt of `stepId`. */
export const newWorkflowStepPromptMessageId = (stepId: string): string =>
  `t3team-wf-turn:${stepId}:${t3teamRandomUUID()}`;

export interface WorkflowStepPrompt {
  readonly messageId: string;
  readonly text: string;
  readonly author: T3TeamMessageWorkflowAuthor;
}

/**
 * The LATEST prompt the run `runId` posted for `stepId` among `messages` (a thread's user
 * messages), or null when the step never reached the thread.
 */
export function findWorkflowStepPrompt(
  messages: ReadonlyArray<OrchestrationV2ConversationMessage>,
  runId: string,
  stepId: string,
): WorkflowStepPrompt | null {
  let latest: { readonly prompt: WorkflowStepPrompt; readonly at: number } | null = null;
  for (const message of messages) {
    if (message.role !== "user") continue;
    const author = readT3TeamMessageExtContext(message.context)?.author;
    if (author?.kind !== "workflow" || author.workflowRunId !== runId || author.stepId !== stepId)
      continue;
    const at = DateTime.toEpochMillis(message.createdAt);
    if (latest !== null && latest.at > at) continue;
    latest = { prompt: { messageId: message.id, text: message.text, author }, at };
  }
  return latest?.prompt ?? null;
}
