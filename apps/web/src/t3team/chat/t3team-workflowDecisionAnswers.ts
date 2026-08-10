/**
 * Correlating an `askUser` decision message with the reply that answered it.
 *
 * Split out of `t3team-messageDecisionCard.tsx` to keep that file under the prefixed-file LOC
 * ceiling; re-exported from there is unnecessary since both live under the `t3team-` prefix and
 * callers import directly.
 */
import type { ChatMessage } from "~/types";

import { getT3TeamWorkflowDecisionAttachment } from "./t3team-messageDecisionCard";

/**
 * One answered ask, keyed by the ask (`waiting-for-input`) message's id — the message
 * immediately following it in the timeline is its answer, since the workflow stays parked until
 * the user replies (nothing else can land in between). `answerMessageId` lets a caller suppress
 * that reply from rendering a second time as its own bare row; `text` is what the ask card shows
 * as the chosen chip once it is no longer the live card.
 */
export type T3TeamWorkflowDecisionAnswer = {
  readonly answerMessageId: string;
  readonly text: string;
};

/**
 * Correlates every decision (`askUser`) message in the timeline with the reply that answered it,
 * by adjacency: the next message-kind entry after the ask carries the answer. Ask messages that
 * are still the live (unanswered) card, or that have nothing after them yet, are absent from the
 * map.
 */
export function findT3TeamWorkflowDecisionAnswers(
  timelineEntries: ReadonlyArray<{ readonly kind: string; readonly message?: ChatMessage }>,
): ReadonlyMap<string, T3TeamWorkflowDecisionAnswer> {
  const answers = new Map<string, T3TeamWorkflowDecisionAnswer>();
  for (let index = 0; index < timelineEntries.length; index += 1) {
    const entry = timelineEntries[index];
    const message = entry?.kind === "message" ? entry.message : undefined;
    if (message === undefined || getT3TeamWorkflowDecisionAttachment(message) === null) {
      continue;
    }

    for (let nextIndex = index + 1; nextIndex < timelineEntries.length; nextIndex += 1) {
      const nextEntry = timelineEntries[nextIndex];
      const nextMessage = nextEntry?.kind === "message" ? nextEntry.message : undefined;
      if (nextMessage === undefined) {
        continue;
      }
      // A later ask (or anything else without text) is not this ask's answer.
      if (
        getT3TeamWorkflowDecisionAttachment(nextMessage) !== null ||
        nextMessage.text.length === 0
      ) {
        break;
      }
      answers.set(message.id, {
        answerMessageId: nextMessage.id,
        text: nextMessage.t3teamExt?.displayText ?? nextMessage.text,
      });
      break;
    }
  }
  return answers;
}
