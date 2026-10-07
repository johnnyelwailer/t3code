import { describe, expect, it } from "vite-plus/test";

import { t3teamWidgetBlockUsesHtmlRenderShim } from "~/t3team/chat/t3team-widgetBlock";

describe("t3teamWidgetBlockUsesHtmlRenderShim", () => {
  const base = {
    widgetId: "w1",
    title: "chart",
    format: "html" as const,
    html: "<div>hi</div>",
  };

  it("is true for html + htmlRender without tools", () => {
    expect(
      t3teamWidgetBlockUsesHtmlRenderShim({
        ...base,
        htmlRender: { attachmentId: "t-1.html", title: "chart", height: 400 },
      }),
    ).toBe(true);
  });

  it("is false for legacy html without htmlRender (back-compat srcdoc)", () => {
    expect(t3teamWidgetBlockUsesHtmlRenderShim(base)).toBe(false);
  });

  it("is false for svg even with a spurious htmlRender", () => {
    expect(
      t3teamWidgetBlockUsesHtmlRenderShim({
        ...base,
        format: "svg",
        html: "<svg/>",
        htmlRender: { attachmentId: "t-1.html", title: "chart", height: 400 },
      }),
    ).toBe(false);
  });

  it("is false when capabilities.tools is non-empty (keep srcdoc bridge)", () => {
    expect(
      t3teamWidgetBlockUsesHtmlRenderShim({
        ...base,
        htmlRender: { attachmentId: "t-1.html", title: "chart", height: 400 },
        capabilities: { tools: ["t3team.view.read"] },
      }),
    ).toBe(false);
  });
});
