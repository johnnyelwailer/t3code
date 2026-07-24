// @vitest-environment jsdom
/**
 * The widget theming + icon contract that authoring guidance promises:
 *   • the mount is an iframe, so theme custom properties do NOT inherit — they are snapshotted
 *     from the live document into the srcdoc's own `:root`. This proves the snapshot resolves in
 *     BOTH light and dark, i.e. one widget markup stays readable in either mode;
 *   • `color-scheme` rides along so native controls and form widgets follow the mode too;
 *   • the sanctioned `.t3w-icon` sprite is host-injected, uses `currentColor`, and needs no
 *     external icon library — so authors never have to fall back on ✅/⚠️/⛔.
 */

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  buildT3workWidgetSrcdoc,
  collectT3workWidgetThemeCss,
  T3WORK_WIDGET_THEME_TOKENS,
} from "~/t3work/chat/t3work-widgetSrcdoc";
import {
  buildT3workWidgetIconSprite,
  T3WORK_WIDGET_ICON_CSS,
  T3WORK_WIDGET_ICON_NAMES,
  t3workWidgetIconId,
} from "~/t3work/chat/t3work-widgetIconSprite";

/** Mirrors the app's real mechanism: one `:root` block, overridden under `.dark`. */
const LIGHT_AND_DARK_TOKENS: ReadonlyArray<readonly [string, string, string]> = [
  ["--background", "#ffffff", "#0a0a0a"],
  ["--foreground", "#262626", "#f5f5f5"],
  ["--card", "#ffffff", "#111111"],
  ["--border", "#e5e5e5", "#333333"],
  ["--success", "#10b981", "#34d399"],
  ["--warning", "#f59e0b", "#fbbf24"],
  ["--destructive", "#ef4444", "#f87171"],
];

function applyTheme(mode: "light" | "dark"): void {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  // jsdom resolves inline custom properties reliably; the class toggle above mirrors the real
  // app's `dark` variant, and we restate the values it would swap in.
  root.style.setProperty("color-scheme", mode);
  for (const [token, light, dark] of LIGHT_AND_DARK_TOKENS) {
    root.style.setProperty(token, mode === "dark" ? dark : light);
  }
  root.style.setProperty("--font-sans", "Inter, system-ui");
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("style");
});

describe("widget theme token contract", () => {
  it("documents the semantic token vocabulary widgets may rely on", () => {
    // The tokens authoring guidance names — colour roles plus their foreground pairs, status
    // tokens, and typography. No hard-coded palette value should ever be needed.
    for (const token of [
      "--background",
      "--foreground",
      "--card",
      "--card-foreground",
      "--popover",
      "--muted",
      "--muted-foreground",
      "--border",
      "--input",
      "--primary",
      "--primary-foreground",
      "--secondary",
      "--accent",
      "--destructive",
      "--info",
      "--success",
      "--warning",
      "--ring",
      "--font-sans",
      "--font-mono",
    ]) {
      expect(T3WORK_WIDGET_THEME_TOKENS).toContain(token);
    }
  });

  it.each(["light", "dark"] as const)(
    "resolves every token, with %s values, inside the iframe srcdoc",
    (mode) => {
      applyTheme(mode);
      const themeCss = collectT3workWidgetThemeCss();
      // A widget authored against the token contract only — zero palette literals.
      const authoredHtml =
        '<div style="background: var(--card); color: var(--foreground); border: 1px solid var(--border)">' +
        '<svg class="t3w-icon" style="color: var(--success)"><use href="#t3w-icon-circle-check"/></svg>' +
        "Ready</div>";
      expect(authoredHtml).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgb\(|\boklch\(/);
      const srcdoc = buildT3workWidgetSrcdoc({ html: authoredHtml, nonce: "n", themeCss });

      for (const [token, light, dark] of LIGHT_AND_DARK_TOKENS) {
        const expected = mode === "dark" ? dark : light;
        expect(themeCss).toContain(`${token}: ${expected};`);
        expect(srcdoc).toContain(`${token}: ${expected};`);
      }
      // The mode itself must cross the iframe boundary, not just the colours.
      expect(themeCss).toContain(`color-scheme: ${mode}`);
      // Typography tokens travel too, so widget text matches the shell.
      expect(themeCss).toContain("--font-sans: Inter, system-ui;");
      // The author's `var(--…)` references survive into the mounted document verbatim.
      expect(srcdoc).toContain("background: var(--card)");
    },
  );

  it("swaps values when the mode flips, with the same widget markup", () => {
    applyTheme("light");
    const light = collectT3workWidgetThemeCss();
    applyTheme("dark");
    const dark = collectT3workWidgetThemeCss();

    expect(light).toContain("--background: #ffffff;");
    expect(dark).toContain("--background: #0a0a0a;");
    expect(light).toContain("color-scheme: light");
    expect(dark).toContain("color-scheme: dark");
  });
});

describe("widget icon sprite", () => {
  it("ships the status icons that replace emoji, as reachable <use> targets", () => {
    const sprite = buildT3workWidgetIconSprite();
    for (const name of ["circle-check", "triangle-alert", "circle-x", "ban", "info", "clock"]) {
      expect(T3WORK_WIDGET_ICON_NAMES).toContain(name);
      expect(sprite).toContain(`id="${t3workWidgetIconId(name)}"`);
    }
    expect(t3workWidgetIconId("check")).toBe("t3w-icon-check");
  });

  it("draws with currentColor only, so icons inherit theme-token text colour", () => {
    const sprite = buildT3workWidgetIconSprite();
    expect(sprite).toContain('stroke="currentColor"');
    expect(sprite).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(sprite).not.toMatch(/\brgb\(|\bhsl\(|\boklch\(/);
    expect(T3WORK_WIDGET_ICON_CSS).toContain("color: currentColor");
  });

  it("is CSP-safe: inline markup with no external reference and no script", () => {
    const sprite = buildT3workWidgetIconSprite();
    expect(sprite).not.toContain("http");
    expect(sprite).not.toContain("<script");
    expect(sprite).not.toContain("<image");
    expect(sprite).not.toContain("xlink:href");
  });

  it("is host-injected and small, so it costs the author nothing against the 128 KB cap", () => {
    const srcdoc = buildT3workWidgetSrcdoc({ html: "<div/>", nonce: "n", themeCss: "" });
    expect(srcdoc).toContain('id="t3w-icon-check"');
    expect(srcdoc).toContain(".t3w-icon {");
    expect(new TextEncoder().encode(buildT3workWidgetIconSprite()).byteLength).toBeLessThan(
      8 * 1024,
    );
  });

  it("sizes icons at 16px/20px and wins over the reset's svg height:auto", () => {
    const srcdoc = buildT3workWidgetSrcdoc({ html: "<div/>", nonce: "n", themeCss: "" });
    expect(T3WORK_WIDGET_ICON_CSS).toContain("width: 16px");
    expect(T3WORK_WIDGET_ICON_CSS).toContain(".t3w-icon-lg { width: 20px; height: 20px; }");
    // Class rule must come after the `svg { height: auto }` reset so the cascade keeps the size.
    expect(srcdoc.indexOf("img, svg, video, canvas")).toBeLessThan(srcdoc.indexOf(".t3w-icon {"));
  });

  it("renders a sprite icon in a document and finds its symbol", () => {
    const host = document.createElement("div");
    host.innerHTML = `${buildT3workWidgetIconSprite()}<svg class="t3w-icon"><use href="#${t3workWidgetIconId("triangle-alert")}"/></svg>`;
    document.body.append(host);
    const symbol = host.querySelector(`#${t3workWidgetIconId("triangle-alert")}`);
    expect(symbol?.tagName.toLowerCase()).toBe("symbol");
    expect(symbol?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(symbol?.querySelectorAll("path").length).toBeGreaterThan(0);
    host.remove();
  });
});
