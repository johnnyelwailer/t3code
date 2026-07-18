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
});
