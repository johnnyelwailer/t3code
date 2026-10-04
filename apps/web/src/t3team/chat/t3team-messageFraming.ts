/**
 * Fork framing on V2 user messages. The hidden-framing predicate and the cached ext decode are
 * shared with mobile (`@t3tools/client-runtime/state/message-framing`).
 */
import type { OrchestrationMessageContext, T3TeamMessageExt } from "@t3tools/contracts";
import {
  isHiddenT3TeamFramingMessage,
  readT3TeamMessageExt,
} from "@t3tools/client-runtime/state/message-framing";

export { isHiddenT3TeamFramingMessage };

/** The fork message ext a V2 turn item carries, spread-ready for a timeline `ChatMessage`. */
export function t3teamMessageExtOf(item: {
  readonly context?: OrchestrationMessageContext | undefined;
}): { readonly t3teamExt?: T3TeamMessageExt } {
  const t3teamExt = readT3TeamMessageExt(item.context);
  return t3teamExt ? { t3teamExt } : {};
}

/**
 * The message as its bubble shows it: a fork send that appended context (work items) to the
 * provider prompt records the person's own words as ext `displayText`, so the bubble shows those
 * instead of the prompt with the context dump. Copy and rollback keep reading `message.text`.
 */
export function t3teamDisplayedUserMessage<
  M extends { readonly text: string; readonly t3teamExt?: T3TeamMessageExt | undefined },
>(message: M): M {
  const displayText = message.t3teamExt?.displayText;
  return displayText === undefined || displayText === message.text
    ? message
    : { ...message, text: displayText };
}
