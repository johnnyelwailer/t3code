import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_T3TEAM_OUTBOX_TIMELINE_EXTENSIONS,
  t3TeamOutboxTimelineExtensions,
} from "./t3team-outboxTimelineRows";
import { makeT3TeamOutboxEntry, type T3TeamOutboxEntry } from "./t3team-outboxModel";

function turnStartEntry(messageId: string): T3TeamOutboxEntry {
  return makeT3TeamOutboxEntry(
    "turn-start",
    {
      messageId,
      messageText: "deploy the fix",
      modelSelection: null,
      titleSeed: "deploy the fix",
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: "2026-09-21T10:00:00.000Z",
    },
    "env-1",
    "thread-1",
  );
}

function cardActionEntry(): T3TeamOutboxEntry {
  return makeT3TeamOutboxEntry(
    "recipe-card-action",
    { cardId: "card-1", actionId: "approve", submit: null },
    "env-1",
    "thread-1",
  );
}

describe("t3TeamOutboxTimelineExtensions", () => {
  it("returns the stable empty array for an empty queue", () => {
    expect(t3TeamOutboxTimelineExtensions([], null, {})).toBe(
      EMPTY_T3TEAM_OUTBOX_TIMELINE_EXTENSIONS,
    );
  });

  it("maps a queued turn-start to a native-shaped row with its delivery status", () => {
    const entry = turnStartEntry("message-1");
    const extensions = t3TeamOutboxTimelineExtensions([entry], null, {});
    expect(extensions).toHaveLength(1);
    expect(extensions[0]?.id).toBe(`t3team-outbox:${entry.entryId}`);
    const markup = renderToStaticMarkup(extensions[0]!.node);
    // The plain message keeps the native queue wording, not a banner of its own.
    expect(markup).toContain("message · Sends when the environment reconnects");
    expect(markup).toContain("deploy the fix");
    expect(markup).toContain('aria-label="Discard queued send"');
    expect(markup).not.toContain("Resend");
  });

  it("surfaces a permanent failure with a resend affordance", () => {
    const entry = cardActionEntry();
    const extensions = t3TeamOutboxTimelineExtensions([entry], null, {
      [entry.entryId]: "card not found",
    });
    const markup = renderToStaticMarkup(extensions[0]!.node);
    // Non-message kinds keep their kind word on the shared queue surface.
    expect(markup).toContain("card action · Failed: card not found");
    expect(markup).toContain("Resend");
    expect(markup).toContain('aria-label="Discard queued send"');
  });

  it("shows the dispatch state for the entry being sent", () => {
    const entry = turnStartEntry("message-2");
    const extensions = t3TeamOutboxTimelineExtensions([entry], entry.entryId, {});
    const markup = renderToStaticMarkup(extensions[0]!.node);
    expect(markup).toContain("message · Sending");
  });
});
