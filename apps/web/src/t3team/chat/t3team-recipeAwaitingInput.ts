/**
 * Detect whether a thread is currently waiting on the user's answer to a workflow `askUser`.
 *
 * The workflow engine tags its escalation message with the fork message ext
 * `status: "waiting-for-input"` (carried in the message context, see
 * `readT3TeamMessageExtContext`). A thread is awaiting input when the latest such message is more
 * recent than the latest user message — i.e. the question hasn't been answered yet. Once the user
 * replies (a user message lands after it) it is no longer awaiting; if the workflow asks again, a
 * newer tagged message makes it awaiting once more.
 */
import { readT3TeamMessageExtContext, type OrchestrationMessageContext } from "@t3tools/contracts";

export interface RecipeAwaitingInputMessage {
  readonly role: string;
  readonly context?: OrchestrationMessageContext | undefined;
}

export function isThreadWaitingForRecipeInput(
  messages: ReadonlyArray<RecipeAwaitingInputMessage> | undefined,
): boolean {
  if (!messages || messages.length === 0) {
    return false;
  }
  let lastWaitingIndex = -1;
  let lastUserIndex = -1;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (readT3TeamMessageExtContext(message?.context)?.status === "waiting-for-input") {
      lastWaitingIndex = index;
    }
    if (message?.role === "user") {
      lastUserIndex = index;
    }
  }
  return lastWaitingIndex >= 0 && lastWaitingIndex > lastUserIndex;
}
