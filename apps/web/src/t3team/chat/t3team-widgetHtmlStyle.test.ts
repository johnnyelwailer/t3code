import { describe, expect, it } from "vite-plus/test";

import { normalizeT3TeamWidgetHtml, T3TEAM_WIDGET_HOST_CSS } from "./t3team-widgetHtmlStyle.ts";

describe("normalizeT3TeamWidgetHtml", () => {
  it("maps common neutral surfaces and default text while preserving semantic colours", () => {
    const html = [
      "<style>body { color: #1f2328; background: #f5f5f5; } .summary { color:#666; } .muted { COLOR: RGB(102, 102, 102); } .header { background-color: rgb(240, 240, 240); color: orange; }</style>",
      '<table style="width:100%;background:#ffffff"><tr><td style="color:green;background: #f0f0f0">Ready</td></tr></table>',
    ].join("");

    const normalized = normalizeT3TeamWidgetHtml(html);

    expect(normalized).toContain("color: var(--foreground, inherit)");
    expect(normalized).toContain("color:var(--muted-foreground");
    expect(normalized).toContain("COLOR: var(--muted-foreground");
    expect(normalized).toContain("background: var(--muted");
    expect(normalized).toContain("background-color: var(--muted");
    expect(normalized).toContain("background:var(--card");
    expect(normalized).toContain("color:green");
    expect(normalized).toContain("color: orange");
    expect(normalized).not.toContain("#f5f5f5");
    expect(normalized).not.toContain("#f0f0f0");
    expect(normalized).not.toContain("#1f2328");
  });

  it("leaves arbitrary and non-surface colours untouched", () => {
    const html =
      '<div style="border:1px solid #f0f0f0;color:#f5f5f5;background:linear-gradient(#f0f0f0,#fff)">x</div>';

    expect(normalizeT3TeamWidgetHtml(html)).toBe(html);
  });
});

describe("T3TEAM_WIDGET_HOST_CSS", () => {
  it("fits ordinary tables before falling back to scrolling for oversized content", () => {
    expect(T3TEAM_WIDGET_HOST_CSS).toContain("overflow: hidden;");
    expect(T3TEAM_WIDGET_HOST_CSS).toContain(
      'body[data-t3team-widget-overflow="true"] { overflow: auto; }',
    );
    expect(T3TEAM_WIDGET_HOST_CSS).toContain(
      "table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important;",
    );
    expect(T3TEAM_WIDGET_HOST_CSS).toContain(
      "overflow-wrap: anywhere; word-break: break-word; white-space: normal !important;",
    );
    expect(T3TEAM_WIDGET_HOST_CSS).toContain("pre { max-width: 100%; overflow-x: auto; }");
  });
});
