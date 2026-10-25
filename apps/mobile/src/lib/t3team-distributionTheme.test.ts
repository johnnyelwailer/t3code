import { describe, expect, it, vi } from "vite-plus/test";
import defaultThemeVariables from "../../generated-uniwind-default-theme-variables.json";
import { readDistributionThemeColors, withDistributionTheme } from "./t3team-distributionTheme";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

const pack = {
  light: {
    primary: "#f05a0a",
    primaryForeground: "#ffffff",
    background: "#faf9fb",
    card: "#ffffff",
  },
  dark: {
    primary: "#f05a0a",
    primaryForeground: "#ffffff",
    background: "#17181c",
    card: "#1e2024",
  },
};

describe("distribution theme", () => {
  it("reads both halves of extra.nexi.theme.colors and rejects partial tables", () => {
    expect(readDistributionThemeColors({ nexi: { theme: { colors: pack } } })).toEqual(pack);
    expect(
      readDistributionThemeColors({ nexi: { theme: { colors: { light: pack.light } } } }),
    ).toBeNull();
    expect(
      readDistributionThemeColors({
        nexi: { theme: { colors: { ...pack, dark: { primary: 1 } } } },
      }),
    ).toBeNull();
    expect(readDistributionThemeColors({})).toBeNull();
  });

  it("leaves stock builds on upstream's default variables", () => {
    expect(withDistributionTheme(defaultThemeVariables.light, "light", null)).toBe(
      defaultThemeVariables.light,
    );
  });

  it("repaints only the variables the pack's roles drive", () => {
    for (const appearance of ["light", "dark"] as const) {
      const defaults = defaultThemeVariables[appearance];
      const themed = withDistributionTheme(defaults, appearance, pack);
      expect(themed["--color-primary"]).toBe("#f05a0a");
      expect(themed["--color-screen"]).toBe(pack[appearance].background);
      expect(themed["--color-grouped-card"]).toBe(pack[appearance].card);
      expect(themed["--color-foreground"]).toBe(defaults["--color-foreground"]);
      expect(Object.keys(themed)).toEqual(Object.keys(defaults));
    }
  });
});
