import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";

import { T3TeamOutboxQueueDock } from "./t3team-outboxQueueDock";
import { makeT3TeamOutboxEntry, type T3TeamOutboxEntry } from "./t3team-outboxModel";
import { removeT3TeamOutboxEntry, retryT3TeamOutboxEntry } from "./t3team-outboxStore";

vi.mock("~/t3team/outbox/t3team-outboxStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./t3team-outboxStore")>();
  return {
    ...actual,
    removeT3TeamOutboxEntry: vi.fn(),
    retryT3TeamOutboxEntry: vi.fn(),
  };
});

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

const dock = (
  entries: ReadonlyArray<T3TeamOutboxEntry>,
  dispatchingEntryId: string | null,
  failures: Readonly<Record<string, string>>,
) => (
  <T3TeamOutboxQueueDock
    entries={entries}
    dispatchingEntryId={dispatchingEntryId}
    failures={failures}
  />
);

describe("T3TeamOutboxQueueDock", () => {
  it("renders nothing for an empty queue", () => {
    expect(renderToStaticMarkup(dock([], null, {}))).toBe("");
  });

  it("lists a queued turn-start on the composer queue dock with its delivery status", () => {
    const entry = turnStartEntry("message-1");
    const markup = renderToStaticMarkup(dock([entry], null, {}));
    expect(markup).toContain(`data-queued-outbox-entry="${entry.entryId}"`);
    // The plain message keeps the native queue wording, not a banner of its own.
    expect(markup).toContain("message · Sends when the environment reconnects");
    expect(markup).toContain("deploy the fix");
    expect(markup).toContain('aria-label="Discard queued send"');
    expect(markup).not.toContain("Resend");
  });

  it("surfaces a permanent failure with a resend affordance", () => {
    const entry = cardActionEntry();
    const markup = renderToStaticMarkup(dock([entry], null, { [entry.entryId]: "card not found" }));
    // Non-message kinds keep their kind word on the shared queue surface.
    expect(markup).toContain("card action · Failed: card not found");
    expect(markup).toContain("Resend");
  });

  it("shows the dispatch state for the entry being sent", () => {
    const entry = turnStartEntry("message-2");
    expect(renderToStaticMarkup(dock([entry], entry.entryId, {}))).toContain("message · Sending");
  });

  it("routes Resend and Discard into the outbox store", async () => {
    vi.mocked(retryT3TeamOutboxEntry).mockClear();
    vi.mocked(removeT3TeamOutboxEntry).mockClear();
    const entry = cardActionEntry();
    const renderer = await act(async () =>
      create(dock([entry], null, { [entry.entryId]: "card not found" })),
    );

    // Resend re-arms the failed entry by its id.
    const resend = renderer.root.findByProps({ children: "Resend" });
    await act(() => resend.props.onClick());
    expect(retryT3TeamOutboxEntry).toHaveBeenCalledWith(entry.entryId);

    // Discard removes the whole entry object.
    const discard = renderer.root.findAll(
      (node) => node.props["aria-label"] === "Discard queued send" && node.props.onClick,
    )[0]!;
    await act(() => discard.props.onClick());
    expect(removeT3TeamOutboxEntry).toHaveBeenCalledWith(entry);
  });
});
