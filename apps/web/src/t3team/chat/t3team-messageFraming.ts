/**
 * Fork framing on V2 user messages.
 *
 * Fork layers post agent-facing framing as user-role messages: run-less notes recorded with
 * `createdBy: "system"` (upstream never creates a system-authored user message), and turns whose
 * fork message ext says `visibleToUser: false` (e.g. the hidden transport of a widget action).
 * The agent reads them; the timeline does not show them.
 */
import {
  readT3TeamMessageExtContext,
  type OrchestrationMessageContext,
  type OrchestrationV2Actor,
  type T3TeamMessageExt,
} from "@t3tools/contracts";

// The timeline re-derives on every projection update; context objects keep their identity
// across updates, so each one is decoded once.
const extByContext = new WeakMap<OrchestrationMessageContext, T3TeamMessageExt | null>();

function readExt(context: OrchestrationMessageContext | undefined): T3TeamMessageExt | undefined {
  if (context === undefined) return undefined;
  let ext = extByContext.get(context);
  if (ext === undefined) {
    ext = readT3TeamMessageExtContext(context) ?? null;
    extByContext.set(context, ext);
  }
  return ext ?? undefined;
}

export function isHiddenT3TeamFramingMessage(message: {
  readonly createdBy?: OrchestrationV2Actor | undefined;
  readonly context?: OrchestrationMessageContext | undefined;
}): boolean {
  if (message.createdBy === "system") return true;
  return readExt(message.context)?.visibleToUser === false;
}

/** The fork message ext a V2 turn item carries, spread-ready for a timeline `ChatMessage`. */
export function t3teamMessageExtOf(item: {
  readonly context?: OrchestrationMessageContext | undefined;
}): { readonly t3teamExt?: T3TeamMessageExt } {
  const t3teamExt = readExt(item.context);
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
