/**
 * A workflow reply (a decision-card click or the resolve route's plain text) recorded as the
 * person's own message, run-less.
 *
 * The workflow reactor resolves a parked `askUser` from the next message a person posts on the
 * thread, so the reply only has to land as a `user` message (`createdBy: "user"`) — it must not
 * start an agent turn: the answer is for the workflow, not a prompt for the thread's agent. The
 * fork recorder writes exactly that (no run) and is idempotent on the message id, so a retried
 * click with the same optimistic id stays one reply.
 */
import { type MessageId, type ThreadId, withT3TeamMessageExtContext } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { T3TeamThreadMessageRecorder } from "./t3team-v2/t3team-threadMessageRecorder.ts";

export interface WorkflowReplyInput {
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly text: string;
  /** A structured card answer; it only answers the ask whose `correlationId` it names. */
  readonly workflowReply?: { readonly value: unknown; readonly correlationId?: string };
}

export const recordWorkflowReply = Effect.fn("recordWorkflowReply")(function* (
  input: WorkflowReplyInput,
) {
  const recorder = yield* T3TeamThreadMessageRecorder;
  const context =
    input.workflowReply === undefined
      ? undefined
      : withT3TeamMessageExtContext({ workflowReply: input.workflowReply });
  return yield* recorder.record({
    threadId: input.threadId,
    messageId: input.messageId,
    role: "user",
    text: input.text,
    creationSource: "web",
    ...(context === undefined ? {} : { context }),
  });
});
