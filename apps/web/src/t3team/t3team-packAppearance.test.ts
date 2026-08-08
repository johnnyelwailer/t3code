// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vite-plus/test";

import { readThemePreference, writeThemePreference } from "~/hooks/useTheme";
import { getCustomThemes, getThemeColorsForMode, invalidateCustomThemes } from "~/themePalette";

import { applyT3TeamPackAppearance } from "./t3team-packAppearance";
import { t3teamPackThemeId } from "./t3team-packThemeDefinition";

describe("pack appearance", () => {
  afterEach(() => {
    applyT3TeamPackAppearance(undefined);
    localStorage.clear();
  });

  it("installs typography and shape CSS, and leaves color to the theme library", () => {
    applyT3TeamPackAppearance({
      themeId: "nexplore",
      name: "Nexplore",
      labels: { appName: "Nexi" },
      density: 0.96,
      colors: { light: { primary: "#f05a00" }, dark: { primary: "#ff6a0a" } },
      typography: { sans: "Inter, sans-serif", mono: "DM Mono, monospace" },
      shape: { radius: "0.5rem" },
    });
    const css = document.getElementById("t3team-pack-theme")?.textContent ?? "";
    // Pack fonts declare UPSTREAM's variables from a stylesheet, so a user's inline font choice
    // still outranks them; the old fork-private `--t3team-font-*` + blanket `body{}` rule made
    // Settings → Appearance → Font a no-op under a pack.
    expect(css).toContain("--font-sans:Inter, sans-serif");
    expect(css).toContain("--font-mono:DM Mono, monospace");
    expect(css).not.toContain("--t3team-font-sans");
    expect(css).not.toContain("body{font-family:");
    expect(css).toContain("--radius:0.5rem");
    // Density is no longer emitted as CSS: upstream sets `root.style.fontSize` inline and
    // unconditionally, so a stylesheet percentage never applied. It seeds the preference instead.
    expect(css).not.toContain("font-size:");
    expect(document.documentElement.dataset.t3teamTheme).toBe("nexplore");

    // The whole point of the unification: colors upstream owns are NOT painted here any more.
    // `primary` now reaches the app as the theme library's `messageAction` role.
    expect(css).not.toContain("--primary:");
    expect(document.documentElement.dataset.themeId).toBe(t3teamPackThemeId("nexplore"));
    const installed = getCustomThemes().find((theme) => theme.id === t3teamPackThemeId("nexplore"));
    expect(installed?.variants?.light?.messageAction).toBe("#f05a00");
    expect(installed?.variants?.dark?.messageAction).toBe("#ff6a0a");
  });

  // Regression: the pack theme must SURVIVE a storage round-trip. Upstream re-validates stored
  // theme ids with `isThemeId` (`/^[a-z0-9](?:[a-z0-9-]{0,47})$/`) on every load, but
  // `installCustomTheme` does not — so an id upstream rejects installs fine, works in memory, and
  // then vanishes on the next load, taking the distribution's whole palette with it. Asserting via
  // `getCustomThemes()` alone cannot catch this: it returns the in-memory snapshot. Dropping the
  // snapshot first forces the real parse.
  it("survives a storage round-trip, so the palette is not lost on reload", () => {
    applyT3TeamPackAppearance({
      themeId: "nexplore",
      name: "Nexplore",
      colors: { light: { primary: "#f05a00" }, dark: { primary: "#ff6a0a" } },
    });

    invalidateCustomThemes();
    const reloaded = getCustomThemes().find((theme) => theme.id === t3teamPackThemeId("nexplore"));
    expect(reloaded).toBeDefined();
    // Assert through the resolver, not the stored shape: upstream drops the variant that matches
    // the base appearance (the base `colors` already carries that half), so checking
    // `variants.light` directly would fail on a theme that is perfectly intact.
    expect(getThemeColorsForMode(reloaded!, "light")?.messageAction).toBe("#f05a00");
    expect(getThemeColorsForMode(reloaded!, "dark")?.messageAction).toBe("#ff6a0a");
  });

  // Regression: selecting the pack theme must resolve the appearance, not default to the
  // definition's nominal half. A pack with `defaultMode: "system"` is nominally "light"; painting
  // that on a dark-mode machine leaves `.dark` on <html> over a light palette, so every `dark:`
  // utility renders its dark variant against light colors.
  it("resolves the appearance and toggles the dark class when selecting the pack theme", () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("dark"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;

    try {
      applyT3TeamPackAppearance({
        themeId: "nexplore",
        name: "Nexplore",
        defaultMode: "system",
        colors: { light: { background: "#ffffff" }, dark: { background: "#000000" } },
      });
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.style.getPropertyValue("--app-theme-canvas")).toBe("#000000");
    } finally {
      window.matchMedia = matchMedia;
      document.documentElement.classList.remove("dark");
    }
  });

  it("keeps the pack theme selectable rather than locking it in", () => {
    applyT3TeamPackAppearance({
      themeId: "nexplore",
      name: "Nexplore",
      colors: { light: { primary: "#f05a00" }, dark: { primary: "#ff6a0a" } },
    });
    expect(document.documentElement.dataset.themeId).toBe(t3teamPackThemeId("nexplore"));

    // A user switches to a built-in…
    writeThemePreference("grove");
    // …and re-applying the SAME pack palette must not drag them back.
    applyT3TeamPackAppearance({
      themeId: "nexplore",
      name: "Nexplore",
      colors: { light: { primary: "#f05a00" }, dark: { primary: "#ff6a0a" } },
    });
    expect(readThemePreference()).toBe("grove");
  });

  it("emits a heading-only display font with @font-face from the brand asset", () => {
    const font = "data:font/ttf;base64,AAEAAA==";
    applyT3TeamPackAppearance({
      themeId: "nexplore",
      name: "Nexplore",
      brand: { displayFont: font },
      typography: { display: '"T3Team Pack Display", sans-serif' },
      colors: { light: {}, dark: {} },
    });
    const css = document.getElementById("t3team-pack-theme")?.textContent ?? "";
    expect(css).toContain(`src:url("${font}")`);
    expect(css).toContain("h1,h2,h3{font-family:var(--t3team-font-display)}");
    expect(css).toContain('--t3team-font-display:"T3Team Pack Display", sans-serif;');
    expect(css).not.toContain("body{font-family:var(--t3team-font-display)");
  });

  it("routes sidebar colors through the theme library and keeps fork-only tokens local", () => {
    applyT3TeamPackAppearance({
      themeId: "nexplore",
      name: "Nexplore",
      colors: {
        light: {
          sidebar: "#fafafa",
          sidebarRowHover: "#eeeeee",
          success: "#0a7f2e",
          sidebarHeaderBackground: "linear-gradient(90deg, #f05a00, #ff8a3d)",
        },
        dark: {
          sidebar: "#111111",
          sidebarHeaderBackground: "url(https://packs.example/header.png)",
        },
      },
    });

    // Sidebar colors have upstream roles, so they travel with the theme…
    const installed = getCustomThemes().find((theme) => theme.id === t3teamPackThemeId("nexplore"));
    expect(installed?.variants?.light?.sidebar).toBe("#fafafa");
    expect(installed?.variants?.light?.sidebarRowHover).toBe("#eeeeee");
    expect(installed?.variants?.dark?.sidebar).toBe("#111111");

    // …while the tokens upstream deliberately leaves independent stay on the fork's element.
    const css = document.getElementById("t3team-pack-theme")?.textContent ?? "";
    expect(css).not.toContain("--sidebar:");
    expect(css).toContain("--success:#0a7f2e");
    // Tokens upstream DERIVES inside `html[data-theme-id]` must be emitted at that specificity or
    // they lose the cascade silently: `:root` is (0,1,0) against the theme block's (0,1,1), and
    // `data-theme-id` is always present once a theme is selected.
    expect(css).toContain("html[data-theme-id]{");
    expect(css).not.toMatch(/:root\{[^}]*--card-foreground/);
    expect(css).toContain(
      "--t3team-sidebar-header-background:linear-gradient(90deg, #f05a00, #ff8a3d)",
    );
    expect(css).toContain(
      "--t3team-sidebar-header-background:url(https://packs.example/header.png)",
    );
  });

  it("swaps the favicon to the brand mark and restores it on reset", () => {
    const original = Object.assign(document.createElement("link"), {
      rel: "icon",
      href: "/favicon.ico",
    });
    document.head.append(original);
    const mark = "data:image/svg+xml;base64,PHN2Zy8+";
    applyT3TeamPackAppearance({
      themeId: "nexplore",
      name: "Nexplore",
      brand: { mark },
      colors: { light: {}, dark: {} },
    });
    const packIcon = document.getElementById("t3team-pack-favicon") as HTMLLinkElement;
    expect(packIcon.href).toBe(mark);
    expect(packIcon.type).toBe("image/svg+xml");
    expect(original.isConnected).toBe(false);
    applyT3TeamPackAppearance(undefined);
    expect(document.getElementById("t3team-pack-favicon")).toBeNull();
    expect(original.isConnected).toBe(true);
    original.remove();
  });
});
