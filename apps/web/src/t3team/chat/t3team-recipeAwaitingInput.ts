/**
 * Detect whether a thread is currently waiting on the user's answer to a workflow `askUser`.
 *
 * The workflow engine tags its escalation message with the fork message ext
 * `status: "waiting-for-input"` (carried in the message context, see
 * `readT3TeamMessageExtContext`). A thread is awaiting input when the latest such message is more
 * recent than the latest message the PERSON wrote — i.e. the question hasn't been answered yet.
 * Once the person replies it is no longer awaiting; if the workflow asks again, a newer tagged
 * message makes it awaiting once more.
 *
 * Only a person-authored user message (`createdBy: "user"`) answers, the same predicate the
 * workflow reactor resolves asks with: wakes, mailbox deliveries, workflow prompts and retry
 * continuations are user-role too, and counting them would route the person's real answer through
 * a normal turn start instead of the workflow resolve.
 */
import {
  readT3TeamMessageExtContext,
  type OrchestrationMessageContext,
  type OrchestrationV2Actor,
} from "@t3tools/contracts";

export interface RecipeAwaitingInputMessage {
  readonly role: string;
  readonly createdBy?: OrchestrationV2Actor | undefined;
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
    if (message?.role === "user" && message.createdBy === "user") {
      lastUserIndex = index;
    }
  }
  return lastWaitingIndex >= 0 && lastWaitingIndex > lastUserIndex;
}
