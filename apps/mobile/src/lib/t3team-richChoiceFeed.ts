/**
 * The rich-choice rows of a mobile thread feed: which cards the thread has, in what state, and
 * where they sit among the feed entries. Pure; the hook that feeds it lives in
 * `state/t3team-useRichChoiceFeedEntries.ts`. Card rules are shared with the web
 * (`@t3tools/shared/t3team-richChoiceCardState`).
 */
import type { T3TeamThreadArtifact } from "@t3tools/contracts";
import {
  deriveRichChoiceCardStatesFromEvents,
  type RichChoiceCardState,
  type RichChoiceThreadEvent,
} from "@t3tools/shared/t3team-richChoiceCardState";
import {
  parseRichChoicePayload,
  parseRichChoicePickIds,
  type RichChoicePayload,
} from "@t3tools/shared/t3team-richChoicePayload";
import { readRichChoiceArtifactWidget } from "@t3tools/shared/t3team-widgetArtifact";

/**
 * What a card shows: the thread's state, plus `queued` for a pick that is saved on this device (or
 * accepted by the server) but whose answering turn item has not arrived yet. It holds the card
 * closed across remounts and restarts, so a second pick cannot be queued.
 */
export type T3TeamRichChoiceEntryState =
  | RichChoiceCardState
  | { readonly status: "queued"; readonly pickedIds: ReadonlyArray<string> };

/** A feed row for one rich-choice card. It is not part of a run, so run folds never hide it. */
export interface T3TeamRichChoiceFeedEntry {
  readonly type: "t3team-rich-choice";
  readonly id: string;
  readonly createdAt: string;
  readonly runId: null;
  readonly widgetId: string;
  readonly title: string;
  readonly payload: RichChoicePayload;
  readonly state: T3TeamRichChoiceEntryState;
}

/** A user message of the thread as the card rules see it (hidden widget replies included). */
export interface T3TeamRichChoiceThreadMessage {
  readonly text: string;
  readonly createdAt: string;
  readonly widgetReplyId?: string | undefined;
}

const instant = (iso: string): number => {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
};

function parsePayload(html: string): RichChoicePayload | null {
  try {
    const parsed = parseRichChoicePayload(JSON.parse(html));
    return parsed.ok ? parsed.payload : null;
  } catch {
    return null;
  }
}

/**
 * Artifacts cover the whole thread but turn items only the loaded window: with `historyComplete`
 * false, cards older than `windowStart` are left out (their answer may sit outside the window).
 * `pendingReplies` are widget action messages still in the outbox or not projected yet.
 */
export function buildRichChoiceFeedEntries(input: {
  readonly artifacts: ReadonlyArray<T3TeamThreadArtifact>;
  readonly messages: ReadonlyArray<T3TeamRichChoiceThreadMessage>;
  readonly pendingReplies?: ReadonlyArray<{
    readonly text: string;
    readonly widgetReplyId: string;
  }>;
  readonly windowStart?: string | null;
  readonly historyComplete?: boolean;
}): ReadonlyArray<T3TeamRichChoiceFeedEntry> {
  const cards = input.artifacts.flatMap((artifact) => {
    const widget = readRichChoiceArtifactWidget(artifact);
    const payload = widget === null ? null : parsePayload(widget.html);
    return widget === null || payload === null ? [] : [{ widget, payload }];
  });
  if (cards.length === 0) return [];
  const timed: Array<{ readonly at: number; readonly event: RichChoiceThreadEvent }> = [
    ...cards.map(({ widget }) => ({
      at: instant(widget.createdAt),
      event: { kind: "card", widgetId: widget.widgetId, html: widget.html } as const,
    })),
    ...input.messages.map((message) => ({
      at: instant(message.createdAt),
      event: {
        kind: "user-message",
        text: message.text,
        widgetReplyId: message.widgetReplyId,
      } as const,
    })),
  ].sort((left, right) => left.at - right.at);
  const states = deriveRichChoiceCardStatesFromEvents(timed.map(({ event }) => event));
  const windowStart =
    input.historyComplete === false && input.windowStart ? instant(input.windowStart) : null;
  return cards
    .filter(({ widget }) => windowStart === null || instant(widget.createdAt) >= windowStart)
    .map(({ widget, payload }) => {
      const derived = states.get(widget.widgetId) ?? { status: "open" as const };
      return {
        type: "t3team-rich-choice" as const,
        id: `t3team-rich-choice:${widget.widgetId}`,
        createdAt: widget.createdAt,
        runId: null,
        widgetId: widget.widgetId,
        title: widget.title,
        payload,
        state:
          derived.status === "open"
            ? (queuedState(payload, widget.widgetId, input.pendingReplies) ?? derived)
            : derived,
      };
    });
}

function queuedState(
  payload: RichChoicePayload,
  widgetId: string,
  pendingReplies: ReadonlyArray<{ readonly text: string; readonly widgetReplyId: string }> = [],
): T3TeamRichChoiceEntryState | null {
  for (const reply of pendingReplies) {
    if (reply.widgetReplyId !== widgetId) continue;
    const pickedIds = parseRichChoicePickIds(payload, reply.text);
    if (pickedIds) return { status: "queued", pickedIds };
  }
  return null;
}

/** Inserts each entry after the last feed entry that is not newer than it, keeping feed order. */
export function spliceFeedEntriesByTime<E extends { readonly createdAt: string }>(
  feed: ReadonlyArray<E>,
  entries: ReadonlyArray<E>,
): ReadonlyArray<E> {
  if (entries.length === 0) return feed;
  const result = [...feed];
  for (const entry of [...entries].sort((a, b) => instant(a.createdAt) - instant(b.createdAt))) {
    const at = instant(entry.createdAt);
    const index = result.findLastIndex((candidate) => instant(candidate.createdAt) <= at);
    result.splice(index + 1, 0, entry);
  }
  return result;
}
