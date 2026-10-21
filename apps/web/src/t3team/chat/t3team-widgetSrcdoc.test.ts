import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_SANS_FONT_STACK } from "~/appearanceFonts";

import { buildT3TeamWidgetSrcdoc } from "./t3team-widgetSrcdoc";

describe("buildT3TeamWidgetSrcdoc", () => {
  it("falls back to the app's own default sans stack, not a generic system-ui stack", () => {
    const srcdoc = buildT3TeamWidgetSrcdoc({
      html: "<p>hi</p>",
      nonce: "test-nonce",
      themeCss: ":root { --foreground: black; }",
    });

    expect(srcdoc).toContain(`var(--font-sans, ${DEFAULT_SANS_FONT_STACK})`);
  });

  it("still prefers the snapshotted --font-sans value when the theme CSS sets one", () => {
    const srcdoc = buildT3TeamWidgetSrcdoc({
      html: "<p>hi</p>",
      nonce: "test-nonce",
      themeCss: ':root { --font-sans: "Custom Sans", sans-serif; }',
    });

    expect(srcdoc).toContain('--font-sans: "Custom Sans", sans-serif;');
    expect(srcdoc).toContain("font-family: var(--font-sans,");
  });

  it("protects persisted light table markup without rewriting semantic colours", () => {
    const srcdoc = buildT3TeamWidgetSrcdoc({
      html: [
        "<style>body { color: #1f2328; } table { background: #f5f5f5; } th { background-color: #f0f0f0; }</style>",
        '<p style="color:#666">Default copy</p>',
        '<table style="width:100%"><tr><th style="color: green">Status</th><td style="color: orange">Ready</td></tr></table>',
      ].join(""),
      nonce: "test-nonce",
      themeCss: ":root { --foreground: #f5f5f5; }",
    });

    expect(srcdoc).not.toContain("background: #f5f5f5");
    expect(srcdoc).not.toContain("background-color: #f0f0f0");
    expect(srcdoc).not.toContain("color: #1f2328");
    expect(srcdoc).not.toContain("color:#666");
    expect(srcdoc).toContain("color:var(--muted-foreground");
    expect(srcdoc).toContain("color: green");
    expect(srcdoc).toContain("color: orange");
    expect(srcdoc).toContain(
      "table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important;",
    );
    expect(srcdoc).toContain(
      "overflow-wrap: anywhere; word-break: break-word; white-space: normal !important;",
    );
    expect(srcdoc).toContain('body[data-t3team-widget-overflow="true"] { overflow: auto; }');
    expect(srcdoc.indexOf("</table>")).toBeLessThan(srcdoc.lastIndexOf("data-t3team-widget-host"));
  });
});
