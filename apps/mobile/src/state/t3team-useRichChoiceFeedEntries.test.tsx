import { withT3TeamMessageExtContext } from "@t3tools/contracts";
import { buildT3TeamWidgetPromptTransport } from "@t3tools/shared/t3team-widgetPromptTransport";
import * as DateTime from "effect/DateTime";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";

const fixture = vi.hoisted(() => ({
  artifacts: [] as unknown[],
  items: [] as unknown[],
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => fixture.items }));
vi.mock("./threads", () => ({
  environmentThreadDetails: { visibleTurnItemsAtom: () => ({}) },
}));
vi.mock("./t3team-threadArtifacts", () => ({ useT3TeamThreadArtifacts: () => fixture.artifacts }));

import { useT3TeamRichChoiceFeedEntries } from "./t3team-useRichChoiceFeedEntries";

const card = {
  id: "widget:w1",
  threadId: "t",
  messageId: null,
  kind: "widget",
  payload: {
    kind: "widget",
    widget: {
      widgetId: "w1",
      title: "pick",
      format: "rich-choice",
      html: JSON.stringify({ prompt: "P", options: [{ id: "a", title: "Alpha", body: "b" }] }),
    },
  },
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};

function userItem(text: string, at: string, context?: unknown) {
  const instant = DateTime.makeUnsafe(at);
  return {
    visibility: "visible",
    sourceThreadId: "t",
    sourceItemId: text,
    item: { type: "user_message", text, context, startedAt: instant, updatedAt: instant },
  };
}

function states() {
  const seen: Array<ReturnType<typeof useT3TeamRichChoiceFeedEntries>> = [];
  function Probe() {
    seen.push(useT3TeamRichChoiceFeedEntries("env" as never, "t" as never));
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  act(() => root.unmount());
  return seen.at(-1)!.map((entry) => entry.state);
}

describe("useT3TeamRichChoiceFeedEntries", () => {
  it("is empty without a widget artifact", () => {
    fixture.artifacts = [];
    fixture.items = [];
    expect(states()).toEqual([]);
  });

  it("answers the card from the hidden widget reply the feed itself drops", () => {
    const transport = buildT3TeamWidgetPromptTransport({
      widgetId: "w1",
      widgetTitle: "pick",
      text: "Chose Alpha (ids: a)",
    });
    fixture.artifacts = [card];
    fixture.items = [
      userItem(
        transport.text,
        "2026-11-01T10:01:00.000Z",
        withT3TeamMessageExtContext(transport.t3teamExt),
      ),
    ];
    expect(states()).toEqual([{ status: "answered", pickedIds: ["a"] }]);
  });

  it("supersedes the card by a typed message sent after it", () => {
    fixture.artifacts = [card];
    fixture.items = [userItem("actually, something else", "2026-11-01T10:02:00.000Z")];
    expect(states()).toEqual([{ status: "stale" }]);
  });
});
