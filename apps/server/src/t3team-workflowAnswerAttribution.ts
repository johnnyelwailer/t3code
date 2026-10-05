/**
 * Attributing the assistant message that ANSWERS a workflow step.
 *
 * The step's prompt carries the `workflow` author (see t3team-workflowTurnAuthor.ts), but the
 * agent's reply carries nothing, so a client could collapse the machine-authored instructions and
 * still had to render the answer as an ordinary assistant message — nine paragraphs of workflow
 * output in the middle of a conversation. The SAME author is recorded for the reply, so prompt
 * and answer collapse under one label.
 *
 * ── Why an artifact ─────────────────────────────────────────────────────────
 * The answer is a provider-written V2 assistant message: it has no fork ext slot and the fork does
 * not rewrite provider messages. The reactor is the one component that knows which assistant
 * message answered which step (it is how `askAgent` resolves), so it records the author as the
 * answer's `message-ext` artifact — the same carrier every other rich message ext rides
 * (t3team-workflowHostMessages.ts) — keyed to the answer's message id.
 *
 * The message stays VISIBLE. Observability over gates: a workflow's output belongs in the
 * conversation, attributed and collapsible — never hidden.
 */
import {
  MessageId,
  type T3TeamMessageExt,
  type T3TeamMessageWorkflowAuthor,
  ThreadId,
} from "@t3tools/contracts";

import type { T3TeamThreadArtifactInput } from "./t3team-v2/t3team-threadArtifactsStore.ts";
import {
  T3TEAM_MESSAGE_EXT_ARTIFACT_KIND,
  t3teamMessageExtArtifactId,
} from "./t3team-workflowHostMessages.ts";

/** The `message-ext` artifact that stamps a step's author onto the message that answered it. */
export function workflowAnswerAttributionArtifact(input: {
  readonly threadId: string;
  readonly messageId: string;
  readonly author: T3TeamMessageWorkflowAuthor;
}): T3TeamThreadArtifactInput {
  return {
    id: t3teamMessageExtArtifactId(input.messageId),
    threadId: ThreadId.make(input.threadId),
    messageId: MessageId.make(input.messageId),
    kind: T3TEAM_MESSAGE_EXT_ARTIFACT_KIND,
    payload: { author: input.author } satisfies T3TeamMessageExt,
  };
}
