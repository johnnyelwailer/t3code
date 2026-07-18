// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vite-plus/test";

import { applyT3workPackAppearance } from "./t3work-packAppearance";

describe("pack appearance", () => {
  afterEach(() => applyT3workPackAppearance(undefined));

  it("installs scoped light, dark, typography, shape and density CSS", () => {
    applyT3workPackAppearance({
      themeId: "nexplore",
      name: "Nexplore",
      labels: { appName: "Nexi" },
      density: 0.96,
      colors: { light: { primary: "#f05a00" }, dark: { primary: "#ff6a0a" } },
      typography: { sans: "Inter, sans-serif", mono: "DM Mono, monospace" },
      shape: { radius: "0.5rem" },
    });
    const css = document.getElementById("t3work-pack-theme")?.textContent;
    expect(css).toContain(":root{--primary:#f05a00");
    expect(css).toContain(":root.dark{--primary:#ff6a0a");
    expect(css).toContain("--radius:0.5rem");
    expect(document.documentElement.dataset.t3workTheme).toBe("nexplore");
  });

  it("emits a heading-only display font with @font-face from the brand asset", () => {
    const font = "data:font/ttf;base64,AAEAAA==";
    applyT3workPackAppearance({
      themeId: "nexplore",
      name: "Nexplore",
      brand: { displayFont: font },
      typography: { display: '"T3work Pack Display", sans-serif' },
      colors: { light: {}, dark: {} },
    });
    const css = document.getElementById("t3work-pack-theme")?.textContent ?? "";
    expect(css).toContain(`src:url("${font}")`);
    expect(css).toContain("h1,h2,h3{font-family:var(--t3work-font-display)}");
    expect(css).toContain('--t3work-font-display:"T3work Pack Display", sans-serif;');
    expect(css).not.toContain("body{font-family:var(--t3work-font-display)");
  });

  it("swaps the favicon to the brand mark and restores it on reset", () => {
    const original = Object.assign(document.createElement("link"), {
      rel: "icon",
      href: "/favicon.ico",
    });
    document.head.append(original);
    const mark = "data:image/svg+xml;base64,PHN2Zy8+";
    applyT3workPackAppearance({
      themeId: "nexplore",
      name: "Nexplore",
      brand: { mark },
      colors: { light: {}, dark: {} },
    });
    const packIcon = document.getElementById("t3work-pack-favicon") as HTMLLinkElement;
    expect(packIcon.href).toBe(mark);
    expect(packIcon.type).toBe("image/svg+xml");
    expect(original.isConnected).toBe(false);
    applyT3workPackAppearance(undefined);
    expect(document.getElementById("t3work-pack-favicon")).toBeNull();
    expect(original.isConnected).toBe(true);
    original.remove();
  });
});
