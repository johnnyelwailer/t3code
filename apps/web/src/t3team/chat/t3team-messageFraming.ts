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

// One derived copy per optimistic message object, so a row keeps its identity across re-derives.
const optimisticWithExt = new WeakMap<object, unknown>();

/**
 * An optimistic row as the timeline shows it: it reads its fork ext from its own context, exactly
 * like the server-echoed row, so the bubble shows the typed `displayText` and work-item cards
 * instead of the provider prompt with the appended context dump until the echo lands.
 */
export function t3teamOptimisticMessage<
  M extends {
    readonly context?: OrchestrationMessageContext | undefined;
    readonly t3teamExt?: T3TeamMessageExt | undefined;
  },
>(message: M): M {
  if (message.t3teamExt !== undefined || message.context === undefined) return message;
  const cached = optimisticWithExt.get(message) as M | undefined;
  if (cached !== undefined) return cached;
  const t3teamExt = readT3TeamMessageExt(message.context);
  const shown = t3teamExt === undefined ? message : { ...message, t3teamExt };
  optimisticWithExt.set(message, shown);
  return shown;
}

/**
 * The message as its bubble shows it: a fork send that appended context (work items) to the
 * provider prompt records the person's own words as ext `displayText`, so the bubble shows those
 * instead of the prompt with the context dump. Copy writes that stored initiating string;
 * rollback still reads `message.text`.
 */
export function t3teamDisplayedUserMessage<
  M extends { readonly text: string; readonly t3teamExt?: T3TeamMessageExt | undefined },
>(message: M): M {
  const displayText = message.t3teamExt?.displayText;
  return displayText === undefined || displayText === message.text
    ? message
    : { ...message, text: displayText };
}
