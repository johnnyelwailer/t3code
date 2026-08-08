import { describe, expect, it } from "vite-plus/test";

import { getStandardThemeColors } from "~/themePalette";

import {
  isT3TeamPackThemeId,
  t3teamPackThemeDefinition,
  t3teamPackThemeId,
} from "./t3team-packThemeDefinition";

const packColors = (overrides: Record<string, string>) => ({ ...overrides });

describe("t3teamPackThemeDefinition", () => {
  it("maps pack tokens onto the roles the app actually derives from", () => {
    const definition = t3teamPackThemeDefinition({
      themeId: "nexplore",
      name: "Nexplore",
      colors: {
        light: packColors({
          background: "#ffffff",
          foreground: "#101010",
          card: "#fafafa",
          popover: "#f5f5f5",
          primary: "#0055ff",
          primaryForeground: "#ffffff",
          accent: "#e6efff",
          accentForeground: "#00204d",
          destructive: "#cc0000",
          ring: "#0055ff",
          appChromeBackground: "#eeeeee",
        }),
        dark: packColors({ background: "#000000", foreground: "#f0f0f0" }),
      },
    });

    const light = definition.variants?.light;
    expect(light).toBeDefined();
    // `--background` derives from canvas, `--foreground` from text.
    expect(light?.canvas).toBe("#ffffff");
    expect(light?.text).toBe("#101010");
    expect(light?.surface).toBe("#fafafa");
    expect(light?.surfaceOverlay).toBe("#f5f5f5");
    // The regression this guards: `primary` must land on the ACTION role (solid CTAs), not on
    // `accent` — mapping it to accent would recolor selection surfaces and leave buttons stock.
    expect(light?.messageAction).toBe("#0055ff");
    expect(light?.messageActionForeground).toBe("#ffffff");
    expect(light?.accentSurface).toBe("#e6efff");
    expect(light?.accentSurfaceForeground).toBe("#00204d");
    expect(light?.error).toBe("#cc0000");
    expect(light?.focus).toBe("#0055ff");
    expect(light?.chrome).toBe("#eeeeee");
  });

  it("fills every unspecified role from the upstream standard palette", () => {
    const definition = t3teamPackThemeDefinition({
      themeId: "sparse",
      colors: { light: packColors({ background: "#ffffff" }), dark: packColors({}) },
    });

    const standardLight = getStandardThemeColors("light");
    const light = definition.variants?.light;
    // A pack that sets one token still yields a complete, legible palette.
    expect(light?.canvas).toBe("#ffffff");
    expect(light?.toolbar).toBe(standardLight.toolbar);
    expect(light?.sidebarRowSelected).toBe(standardLight.sidebarRowSelected);
    expect(Object.keys(light ?? {}).sort()).toEqual(Object.keys(standardLight).sort());
  });

  it("carries both halves so follow-system works without a second definition", () => {
    const definition = t3teamPackThemeDefinition({
      themeId: "nexplore",
      colors: {
        light: packColors({ background: "#ffffff" }),
        dark: packColors({ background: "#000000" }),
      },
    });

    expect(definition.variants?.light.canvas).toBe("#ffffff");
    expect(definition.variants?.dark.canvas).toBe("#000000");
  });

  it("opens in the pack's declared default mode", () => {
    const dark = t3teamPackThemeDefinition({
      themeId: "nexplore",
      defaultMode: "dark",
      colors: {
        light: packColors({ background: "#ffffff" }),
        dark: packColors({ background: "#000000" }),
      },
    });
    expect(dark.appearance).toBe("dark");
    expect(dark.colors.canvas).toBe("#000000");

    // `system` is not a paintable half; it resolves to light as the nominal appearance while
    // `variants` still lets upstream pick the right half at runtime.
    const system = t3teamPackThemeDefinition({
      themeId: "nexplore",
      defaultMode: "system",
      colors: {
        light: packColors({ background: "#ffffff" }),
        dark: packColors({ background: "#000000" }),
      },
    });
    expect(system.appearance).toBe("light");
    expect(system.variants?.dark.canvas).toBe("#000000");
  });

  it("namespaces pack theme ids so they cannot collide with built-ins", () => {
    const definition = t3teamPackThemeDefinition({
      themeId: "nexplore",
      colors: { light: packColors({}), dark: packColors({}) },
    });
    expect(definition.id).toBe(t3teamPackThemeId("nexplore"));
    expect(isT3TeamPackThemeId(definition.id)).toBe(true);
    expect(isT3TeamPackThemeId("grove")).toBe(false);
  });

  it("refuses to claim a reserved theme id", () => {
    expect(() =>
      t3teamPackThemeDefinition({
        themeId: "dark",
        colors: { light: packColors({}), dark: packColors({}) },
      }),
    ).toThrow(/reserved/);
  });
});
