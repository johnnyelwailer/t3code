/**
 * Whether a rich-choice card is still open, was answered, or was superseded, derived from the
 * thread so it survives remounts and reloads. Pure: each client maps its own timeline (web chat
 * messages, mobile turn items) to `RichChoiceThreadEvent`s in thread order and shares these rules.
 */
import {
  parseRichChoicePayload,
  parseRichChoicePickIds,
  type RichChoicePayload,
} from "./t3team-richChoicePayload.ts";

export type RichChoiceCardState =
  | { readonly status: "open" }
  | { readonly status: "answered"; readonly pickedIds: ReadonlyArray<string> }
  /** A newer rich-choice card or a typed user message came after this card. */
  | { readonly status: "stale" };

export type RichChoiceThreadEvent =
  /** A rich-choice widget was shown (`html` is its payload JSON). */
  | { readonly kind: "card"; readonly widgetId: string; readonly html: string }
  /** A user message; `widgetReplyId` is set when it is a widget action reply. */
  | {
      readonly kind: "user-message";
      readonly text: string;
      readonly widgetReplyId?: string | undefined;
    };

function safeParse(html: string): RichChoicePayload | null {
  try {
    const parsed = parseRichChoicePayload(JSON.parse(html));
    return parsed.ok ? parsed.payload : null;
  } catch {
    return null;
  }
}

/**
 * The first widget action for a card answers it (a replay never changes the answer); a later
 * rich-choice card or any typed user message supersedes a card that is still open.
 */
export function deriveRichChoiceCardStatesFromEvents(
  events: Iterable<RichChoiceThreadEvent>,
): ReadonlyMap<string, RichChoiceCardState> {
  const states = new Map<string, RichChoiceCardState>();
  const payloads = new Map<string, RichChoicePayload>();
  const supersedeOpen = () => {
    for (const [id, state] of states)
      if (state.status === "open") states.set(id, { status: "stale" });
  };
  for (const event of events) {
    if (event.kind === "card") {
      const payload = safeParse(event.html);
      if (!payload) continue;
      supersedeOpen();
      payloads.set(event.widgetId, payload);
      states.set(event.widgetId, { status: "open" });
      continue;
    }
    if (event.widgetReplyId === undefined) {
      supersedeOpen();
      continue;
    }
    const payload = payloads.get(event.widgetReplyId);
    if (!payload || states.get(event.widgetReplyId)?.status !== "open") continue;
    const pickedIds = parseRichChoicePickIds(payload, event.text);
    if (pickedIds) states.set(event.widgetReplyId, { status: "answered", pickedIds });
  }
  return states;
}
