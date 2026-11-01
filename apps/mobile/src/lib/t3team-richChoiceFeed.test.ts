import type { T3TeamThreadArtifact } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildRichChoiceFeedEntries,
  spliceFeedEntriesByTime,
  type T3TeamRichChoiceThreadMessage,
} from "./t3team-richChoiceFeed";

const payload = (title = "Alpha") =>
  JSON.stringify({
    prompt: "Pick one",
    options: [
      { id: "a", title, body: "first" },
      { id: "b", title: "Beta", body: "second" },
    ],
  });

function artifact(
  widgetId: string,
  createdAt: string,
  extra: {
    readonly kind?: string;
    readonly format?: string;
    readonly html?: string;
  } = {},
): T3TeamThreadArtifact {
  return {
    id: `widget:${widgetId}`,
    threadId: "thread-1",
    messageId: null,
    kind: extra.kind ?? "widget",
    payload: {
      kind: "widget",
      widget: {
        widgetId,
        title: "pick_a_role",
        format: extra.format ?? "rich-choice",
        html: extra.html ?? payload(),
      },
    },
    createdAt,
    updatedAt: createdAt,
  } as unknown as T3TeamThreadArtifact;
}

const message = (
  createdAt: string,
  text: string,
  widgetReplyId?: string,
): T3TeamRichChoiceThreadMessage => ({ text, createdAt, widgetReplyId });

describe("buildRichChoiceFeedEntries", () => {
  it("turns a rich-choice widget artifact into an open feed row outside any run", () => {
    const [entry, ...rest] = buildRichChoiceFeedEntries({
      artifacts: [artifact("w1", "2026-11-01T10:00:00.000Z")],
      messages: [],
    });
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      type: "t3team-rich-choice",
      id: "t3team-rich-choice:w1",
      runId: null,
      widgetId: "w1",
      title: "pick_a_role",
      state: { status: "open" },
    });
    expect(entry?.payload.options.map((option) => option.id)).toEqual(["a", "b"]);
  });

  it("skips other artifact kinds, other formats and payloads that do not validate", () => {
    expect(
      buildRichChoiceFeedEntries({
        artifacts: [
          artifact("html", "2026-11-01T10:00:00.000Z", { format: "html" }),
          artifact("ext", "2026-11-01T10:00:00.000Z", { kind: "message-ext" }),
          artifact("bad", "2026-11-01T10:00:00.000Z", { html: "{nope" }),
          artifact("img", "2026-11-01T10:00:00.000Z", {
            html: JSON.stringify({
              prompt: "p",
              options: [{ id: "a", title: "t", body: "b", image: { src: "x" } }],
            }),
          }),
        ],
        messages: [],
      }),
    ).toEqual([]);
  });

  it("marks the card answered from the hidden widget reply, the first reply winning", () => {
    const [entry] = buildRichChoiceFeedEntries({
      artifacts: [artifact("w1", "2026-11-01T10:00:00.000Z")],
      messages: [
        message("2026-11-01T10:01:00.000Z", "Widget “x” action: Chose Beta (ids: b)", "w1"),
        message("2026-11-01T10:02:00.000Z", "Widget “x” action: Chose Alpha (ids: a)", "w1"),
      ],
    });
    expect(entry?.state).toEqual({ status: "answered", pickedIds: ["b"] });
  });

  it("supersedes an open card by a newer card or a typed message sent after it", () => {
    const entries = buildRichChoiceFeedEntries({
      artifacts: [
        artifact("w1", "2026-11-01T10:00:00.000Z"),
        artifact("w2", "2026-11-01T10:05:00.000Z"),
        artifact("w3", "2026-11-01T10:10:00.000Z"),
      ],
      messages: [
        message("2026-11-01T10:06:00.000Z", "Chose Alpha (ids: a)", "w2"),
        message("2026-11-01T10:11:00.000Z", "never mind"),
      ],
    });
    expect(entries.map((entry) => [entry.widgetId, entry.state.status])).toEqual([
      ["w1", "stale"],
      ["w2", "answered"],
      ["w3", "stale"],
    ]);
  });

  it("does not let a typed message from before the card supersede it", () => {
    const [entry] = buildRichChoiceFeedEntries({
      artifacts: [artifact("w1", "2026-11-01T10:00:00.000Z")],
      messages: [message("2026-11-01T09:59:00.000Z", "hello")],
    });
    expect(entry?.state).toEqual({ status: "open" });
  });

  it("keeps a hostile title as plain data for the view to render as text", () => {
    const hostile = "<img src=x onerror=alert(1)> **bold** [link](javascript:alert(1))";
    const [entry] = buildRichChoiceFeedEntries({
      artifacts: [artifact("w1", "2026-11-01T10:00:00.000Z", { html: payload(hostile) })],
      messages: [],
    });
    expect(entry?.payload.options[0]?.title).toBe(hostile);
  });
});

describe("spliceFeedEntriesByTime", () => {
  const at = (id: string, createdAt: string) => ({ id, createdAt });

  it("places a row after the last entry that is not newer than it", () => {
    const feed = [
      at("m1", "2026-11-01T10:00:00.000Z"),
      at("m2", "2026-11-01T10:02:00.000Z"),
      at("m3", "2026-11-01T10:09:00.000Z"),
    ];
    const result = spliceFeedEntriesByTime(feed, [at("card", "2026-11-01T10:05:00.000Z")]);
    expect(result.map((entry) => entry.id)).toEqual(["m1", "m2", "card", "m3"]);
  });

  it("puts a row older than everything first and a newer one last, and keeps the feed when empty", () => {
    const feed = [at("m1", "2026-11-01T10:00:00.000Z")];
    expect(
      spliceFeedEntriesByTime(feed, [at("old", "2026-11-01T09:00:00.000Z")]).map((e) => e.id),
    ).toEqual(["old", "m1"]);
    expect(
      spliceFeedEntriesByTime(feed, [at("new", "2026-11-01T11:00:00.000Z")]).map((e) => e.id),
    ).toEqual(["m1", "new"]);
    expect(spliceFeedEntriesByTime(feed, [])).toBe(feed);
  });
});
