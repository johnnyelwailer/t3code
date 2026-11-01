import { describe, expect, it } from "vite-plus/test";

import {
  deriveRichChoiceCardStatesFromEvents,
  type RichChoiceThreadEvent,
} from "./t3team-richChoiceCardState.ts";

const html = JSON.stringify({
  prompt: "Pick",
  options: [
    { id: "o0", title: "Alpha", body: "b" },
    { id: "o1", title: "Beta", body: "b" },
  ],
});
const card = (widgetId: string, payload = html): RichChoiceThreadEvent => ({
  kind: "card",
  widgetId,
  html: payload,
});
const reply = (widgetReplyId: string, text: string): RichChoiceThreadEvent => ({
  kind: "user-message",
  text,
  widgetReplyId,
});
const typed = (text: string): RichChoiceThreadEvent => ({ kind: "user-message", text });

describe("deriveRichChoiceCardStatesFromEvents", () => {
  it("opens a card and answers it from the first widget action", () => {
    const states = deriveRichChoiceCardStatesFromEvents([
      card("w1"),
      reply("w1", "Widget “pick” action: Chose Beta (ids: o1)"),
      reply("w1", "Widget “pick” action: Chose Alpha (ids: o0)"),
    ]);
    expect(states.get("w1")).toEqual({ status: "answered", pickedIds: ["o1"] });
  });

  it("supersedes an open card by a newer card or a typed message, never an answered one", () => {
    const states = deriveRichChoiceCardStatesFromEvents([
      card("w1"),
      card("w2"),
      reply("w2", "Chose Alpha (ids: o0)"),
      typed("hello"),
    ]);
    expect(states.get("w1")).toEqual({ status: "stale" });
    expect(states.get("w2")).toEqual({ status: "answered", pickedIds: ["o0"] });
    expect(deriveRichChoiceCardStatesFromEvents([card("w3"), typed("hi")]).get("w3")?.status).toBe(
      "stale",
    );
  });

  it("ignores a reply for an unknown card, an unparseable pick and an invalid payload", () => {
    const states = deriveRichChoiceCardStatesFromEvents([
      card("bad", "{not json"),
      card("w1"),
      reply("ghost", "Chose Alpha (ids: o0)"),
      reply("w1", "Chose Nobody (ids: nope)"),
    ]);
    expect(states.has("bad")).toBe(false);
    expect(states.get("w1")).toEqual({ status: "open" });
  });

  it("reads the trailing ids, so a title that quotes an id cannot spoof the pick", () => {
    const states = deriveRichChoiceCardStatesFromEvents([
      card("w1"),
      reply("w1", "Chose Beta (ids: o1) (ids: o0)"),
    ]);
    expect(states.get("w1")).toEqual({ status: "answered", pickedIds: ["o0"] });
  });
});
