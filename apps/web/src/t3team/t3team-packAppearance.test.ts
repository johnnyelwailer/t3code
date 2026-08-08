// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vite-plus/test";

import { readThemePreference, writeThemePreference } from "~/hooks/useTheme";
import { getCustomThemes } from "~/themePalette";

import { applyT3TeamPackAppearance } from "./t3team-packAppearance";
import { t3teamPackThemeId } from "./t3team-packThemeDefinition";

describe("pack appearance", () => {
  afterEach(() => {
    applyT3TeamPackAppearance(undefined);
    localStorage.clear();
  });

  it("installs typography, shape and density CSS, and leaves color to the theme library", () => {
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
    expect(css).toContain("--t3team-font-sans:Inter, sans-serif");
    expect(css).toContain("--radius:0.5rem");
    expect(css).toContain("font-size:96%");
    expect(document.documentElement.dataset.t3teamTheme).toBe("nexplore");

    // The whole point of the unification: colors upstream owns are NOT painted here any more.
    // `primary` now reaches the app as the theme library's `messageAction` role.
    expect(css).not.toContain("--primary:");
    expect(document.documentElement.dataset.themeId).toBe(t3teamPackThemeId("nexplore"));
    const installed = getCustomThemes().find((theme) => theme.id === t3teamPackThemeId("nexplore"));
    expect(installed?.variants?.light.messageAction).toBe("#f05a00");
    expect(installed?.variants?.dark.messageAction).toBe("#ff6a0a");
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
    expect(installed?.variants?.light.sidebar).toBe("#fafafa");
    expect(installed?.variants?.light.sidebarRowHover).toBe("#eeeeee");
    expect(installed?.variants?.dark.sidebar).toBe("#111111");

    // …while the tokens upstream deliberately leaves independent stay on the fork's element.
    const css = document.getElementById("t3team-pack-theme")?.textContent ?? "";
    expect(css).not.toContain("--sidebar:");
    expect(css).toContain("--success:#0a7f2e");
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
