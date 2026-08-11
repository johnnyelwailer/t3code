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
});
