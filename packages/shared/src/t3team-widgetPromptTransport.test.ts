import { describe, expect, it } from "vite-plus/test";

import {
  buildT3TeamWidgetPromptTransport,
  humanizeWidgetTitle,
} from "./t3team-widgetPromptTransport.ts";

describe("buildT3TeamWidgetPromptTransport", () => {
  it("builds the hidden, agent-visible widget action message", () => {
    expect(
      buildT3TeamWidgetPromptTransport({
        widgetId: "w1",
        widgetTitle: "pick_a-role",
        text: "  Chose Alpha (ids: o0)  ",
      }),
    ).toEqual({
      text: "Widget “pick a role” action: Chose Alpha (ids: o0)",
      t3teamExt: {
        displayText: "Chose Alpha (ids: o0)",
        visibleToUser: false,
        visibleToAgent: true,
        widgetReply: { widgetId: "w1", widgetTitle: "pick a role" },
      },
    });
  });

  it("falls back to Widget for an empty title", () => {
    expect(humanizeWidgetTitle(" _- ")).toBe("");
    expect(
      buildT3TeamWidgetPromptTransport({ widgetId: "w", widgetTitle: "_", text: "x" }).text,
    ).toBe("Widget “Widget” action: x");
  });
});
