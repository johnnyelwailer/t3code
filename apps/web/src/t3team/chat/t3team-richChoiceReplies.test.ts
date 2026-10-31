import type { T3TeamMessageWidgetAttachment } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ChatMessage } from "~/types";

import { deriveRichChoiceCardStates } from "./t3team-richChoiceReplies";

const card = (
  widgetId: string,
  titles = ["Alpha", "Beta"],
  html = JSON.stringify({
    prompt: "Pick",
    options: titles.map((title, i) => ({ id: `o${i}`, title, body: "b" })),
  }),
): ChatMessage =>
  ({
    id: `m-${widgetId}`,
    role: "system",
    text: "",
    t3teamExt: {
      attachments: [
        {
          kind: "widget",
          widget: {
            widgetId,
            title: "pick",
            format: "rich-choice",
            html,
          },
        } satisfies T3TeamMessageWidgetAttachment,
      ],
    },
  }) as unknown as ChatMessage;
const reply = (widgetId: string, text: string): ChatMessage =>
  ({
    id: `r-${text}`,
    role: "user",
    text,
    t3teamExt: { visibleToUser: false, widgetReply: { widgetId, widgetTitle: "pick" } },
  }) as unknown as ChatMessage;
const typed = (text: string): ChatMessage =>
  ({ id: `t-${text}`, role: "user", text }) as unknown as ChatMessage;
const entries = (...messages: ChatMessage[]) =>
  messages.map((message) => ({ kind: "message", message }));

describe("deriveRichChoiceCardStates", () => {
  it("leaves an unanswered card open", () => {
    expect(deriveRichChoiceCardStates(entries(card("w1"))).get("w1")).toEqual({ status: "open" });
  });

  it("answers a card from its widget action, and the first answer wins on replay", () => {
    const states = deriveRichChoiceCardStates(
      entries(
        card("w1"),
        reply("w1", "Widget “pick” action: Chose Beta (ids: o1)"),
        reply("w1", "Widget “pick” action: Chose Alpha (ids: o0)"),
      ),
    );
    expect(states.get("w1")).toEqual({ status: "answered", pickedIds: ["o1"] });
  });

  it("supersedes an open card by a newer card or a typed message, but not an answered one", () => {
    const states = deriveRichChoiceCardStates(
      entries(
        card("w1"),
        reply("w1", "Chose Alpha (ids: o0)"),
        card("w2"),
        card("w3"),
        card("w4"),
        typed("never mind"),
      ),
    );
    expect(states.get("w1")?.status).toBe("answered");
    expect(states.get("w2")?.status).toBe("stale");
    expect(states.get("w3")?.status).toBe("stale");
    expect(states.get("w4")?.status).toBe("stale");
  });

  it("ignores replies for unknown cards, unknown ids, and titles that quote an ids marker", () => {
    const states = deriveRichChoiceCardStates(
      entries(
        card("w1", ["Evil (ids: o1)", "Beta"]),
        reply("ghost", "Chose x (ids: o0)"),
        reply("w1", "Chose x (ids: admin)"),
      ),
    );
    expect(states.get("w1")).toEqual({ status: "open" });
    const answered = deriveRichChoiceCardStates(
      entries(
        card("w1", ["Evil (ids: o1)", "Beta"]),
        reply("w1", "Chose Evil (ids: o1) (ids: o0)"),
      ),
    );
    expect(answered.get("w1")).toEqual({ status: "answered", pickedIds: ["o0"] });
  });

  it("ignores cards with an invalid payload", () => {
    const broken = card("w1", ["A"], "{nope");
    expect(deriveRichChoiceCardStates(entries(broken)).size).toBe(0);
  });
});
