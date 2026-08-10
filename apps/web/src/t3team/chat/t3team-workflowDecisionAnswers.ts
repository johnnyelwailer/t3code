/**
 * Correlating an `askUser` decision message with the reply that answered it.
 *
 * Split out of `t3team-messageDecisionCard.tsx` to keep that file under the prefixed-file LOC
 * ceiling; re-exported from there is unnecessary since both live under the `t3team-` prefix and
 * callers import directly.
 */
import {
  isProjectRecipeWorkflowDecisionPayload,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
  type ProjectRecipeWorkflowDecisionPayload,
} from "@t3tools/project-recipes";

import type { ChatMessage } from "~/types";

/**
 * Reads the `t3team.workflow.decision` view attachment off a message, when present. Lives here
 * (rather than in `t3team-messageDecisionCard.tsx`, which re-exports it for existing callers) so
 * this module's correlation logic doesn't need a value import back into the card module — that
 * module imports `T3TeamWorkflowDecisionAnswer` as a type from here, and a two-way import between
 * the pair is an import cycle even when one direction is type-only.
 */
export function getT3TeamWorkflowDecisionAttachment(
  message: Pick<ChatMessage, "t3teamExt">,
): ProjectRecipeWorkflowDecisionPayload | null {
  for (const attachment of message.t3teamExt?.attachments ?? []) {
    if (attachment.kind !== "view") {
      continue;
    }
    if (attachment.miniappId !== PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION) {
      continue;
    }
    if (isProjectRecipeWorkflowDecisionPayload(attachment.props)) {
      return attachment.props;
    }
  }

  return null;
}

/**
 * One answered ask, keyed by the ask (`waiting-for-input`) message's id — lets a caller keep the
 * ask card in an answered state (question + chosen chip) once it is no longer the live card.
 * `answerMessageId` additionally lets a caller suppress that reply from rendering a second time
 * as its own bare row.
 */
export type T3TeamWorkflowDecisionAnswer = {
  readonly answerMessageId: string;
  readonly text: string;
};

/**
 * Correlates every decision (`askUser`) message in the timeline with the reply that answered it.
 *
 * The authoritative key is `decision.correlationId` on the ask (see
 * `t3team-messageDecisionCard.tsx`), matched against `t3teamExt.workflowReply.correlationId` on
 * the reply — the server stamps it there when resolving a structured input (see
 * `t3team-thread-recipe-workflow-routes-resolve.ts`). Adjacency is NOT reliable: an interleaved
 * system notification (or any other message landing between the ask and the reply) is not the
 * answer, and must be left alone rather than mis-claimed and suppressed.
 *
 * Legacy messages carry no `workflowReply` ext at all (older clients, or a freeform reply typed
 * in the composer instead of through the card). For those, and only when no reply anywhere in the
 * timeline names this ask by correlationId, fall back to the first FOLLOWING message with
 * `role === "user"`.
 */
export function findT3TeamWorkflowDecisionAnswers(
  timelineEntries: ReadonlyArray<{ readonly kind: string; readonly message?: ChatMessage }>,
): ReadonlyMap<string, T3TeamWorkflowDecisionAnswer> {
  const messages: ChatMessage[] = [];
  for (const entry of timelineEntries) {
    if (entry.kind === "message" && entry.message !== undefined) {
      messages.push(entry.message);
    }
  }

  // Index every reply that names its ask explicitly, by correlationId.
  const repliesByCorrelationId = new Map<string, ChatMessage>();
  for (const message of messages) {
    const correlationId = message.t3teamExt?.workflowReply?.correlationId;
    if (correlationId !== undefined && !repliesByCorrelationId.has(correlationId)) {
      repliesByCorrelationId.set(correlationId, message);
    }
  }

  const answers = new Map<string, T3TeamWorkflowDecisionAnswer>();
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    const decision = getT3TeamWorkflowDecisionAttachment(message);
    if (decision === null) {
      continue;
    }

    const correlatedReply = repliesByCorrelationId.get(decision.correlationId);
    if (correlatedReply !== undefined) {
      answers.set(message.id, {
        answerMessageId: correlatedReply.id,
        text: correlatedReply.t3teamExt?.displayText ?? correlatedReply.text,
      });
      continue;
    }

    // Legacy fallback: no reply anywhere claims this ask by correlationId, so the message
    // immediately answering it (if any) never got the ext written — pick the first following
    // user-role message, since the workflow stays parked until the user replies (nothing else
    // can legitimately land in between for an ask with no correlated reply).
    for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
      const candidate = messages[nextIndex]!;
      if (candidate.role !== "user") {
        continue;
      }
      if (candidate.text.length === 0) {
        break;
      }
      answers.set(message.id, {
        answerMessageId: candidate.id,
        text: candidate.t3teamExt?.displayText ?? candidate.text,
      });
      break;
    }
  }
  return answers;
}
