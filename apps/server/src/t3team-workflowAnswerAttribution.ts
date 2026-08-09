/**
 * Attributing the assistant messages that ANSWER a workflow step.
 *
 * The step's prompt carries the `workflow` author (see t3team-workflowTurnAuthor.ts), but the
 * agent's reply carried nothing, so a client could collapse the machine-authored instructions and
 * still had to render the answer as an ordinary assistant message — nine paragraphs of workflow
 * output in the middle of a conversation. This stamps the SAME author onto the reply, so prompt and
 * answer collapse under one label.
 *
 * ── Why a re-upsert, and why here ───────────────────────────────────────────
 * Assistant messages are written by `ProviderRuntimeIngestion` from `content.delta` /
 * `item.completed`, whose commands carry no `t3teamExt` — and that module is not in the additive
 * guard's whitelist, so stamping at the source is not available. The reactor is the one component
 * that already knows which assistant messages belong to which step (it is how `askAgent` resolves),
 * so it re-upserts the finished message by its own id, with its own text, plus the author. The
 * projector replaces a message wholesale on upsert, which is why the text is passed back verbatim:
 * it is the exact concatenation of the deltas the projection accumulated, which the reactor already
 * holds because it assembled the same deltas to resolve the ask.
 *
 * The message stays VISIBLE. Observability over gates: a workflow's output belongs in the
 * conversation, attributed and collapsible — never hidden with `visibleToUser: false`.
 */

import {
  CommandId,
  MessageId,
  type OrchestrationCommand,
  type T3TeamMessageExt,
  type T3TeamMessageWorkflowAuthor,
  ThreadId,
  type TurnId,
} from "@t3tools/contracts";

/** `true` when a message already carries workflow attribution — the stamp must not re-fire on its
 * own upsert, which would loop and would also double-count the message as a candidate answer. */
export function isWorkflowAttributed(ext: T3TeamMessageExt | undefined): boolean {
  return ext?.author?.kind === "workflow";
}

/**
 * The command that attributes one finished assistant message to the step it answered. Same message
 * id (an in-place update), same text, same turn — only the author is added.
 */
export function workflowAnswerAttributionCommand(input: {
  readonly threadId: string;
  readonly messageId: string;
  readonly text: string;
  readonly turnId: TurnId | null;
  readonly author: T3TeamMessageWorkflowAuthor;
  readonly commandId: string;
  readonly createdAt: string;
}): OrchestrationCommand {
  return {
    type: "thread.message.upsert",
    commandId: CommandId.make(`server:t3team:wf-answer:${input.commandId}`),
    threadId: ThreadId.make(input.threadId),
    message: {
      messageId: MessageId.make(input.messageId),
      role: "assistant",
      text: input.text,
      turnId: input.turnId,
      streaming: false,
      t3teamExt: { author: input.author },
    },
    createdAt: input.createdAt,
  };
}
