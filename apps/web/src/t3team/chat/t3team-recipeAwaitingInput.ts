/**
 * Detect whether a thread is currently waiting on the user's answer to a workflow `askUser`.
 *
 * The workflow-engine broker tags its escalation message with
 * `t3teamExt.status === "waiting-for-input"`. A thread is awaiting input when the latest such
 * message is more recent than the latest user message — i.e. the question hasn't been answered
 * yet. Once the user replies (a user message lands after it) it is no longer awaiting; if the
 * workflow asks again, a newer tagged message makes it awaiting once more.
 */
import type { ChatMessage } from "~/types";

export function isThreadWaitingForRecipeInput(
  serverThread: { readonly messages: ReadonlyArray<ChatMessage> } | undefined,
): boolean {
  const messages = serverThread?.messages;
  if (!messages || messages.length === 0) {
    return false;
  }
  let lastWaitingIndex = -1;
  let lastUserIndex = -1;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.t3teamExt?.status === "waiting-for-input") {
      lastWaitingIndex = index;
    }
    if (message?.role === "user") {
      lastUserIndex = index;
    }
  }
  return lastWaitingIndex >= 0 && lastWaitingIndex > lastUserIndex;
}
