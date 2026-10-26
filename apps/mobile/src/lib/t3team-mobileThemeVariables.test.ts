import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MobileExtensions } from "../extensions/t3team-extensionTypes";

const registry = vi.hoisted(() => ({ current: {} as MobileExtensions }));
vi.mock("../extensions/t3team-extensions", () => ({
  get mobileExtensions() {
    return registry.current;
  },
}));

import defaultThemeVariables from "../../generated-uniwind-default-theme-variables.json";
import { DEFAULT_MOBILE_THEME_ID } from "./mobileTheme";
import { getMobileThemeRuntimeVariables } from "./mobileThemeVariables";

const defaults = defaultThemeVariables as Record<"light" | "dark", Record<string, string>>;

beforeEach(() => {
  registry.current = {};
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("distribution theme variables", () => {
  it("are the app's defaults without a distribution", () => {
    const variables = getMobileThemeRuntimeVariables(DEFAULT_MOBILE_THEME_ID, "light", "ios");
    expect(variables["--color-foreground"]).toBe(defaults.light["--color-foreground"]);
  });

  it("override the defaults they return", () => {
    registry.current = {
      themeVariables: (base) => ({ ...base, "--color-foreground": "#123456" }),
    };
    expect(
      getMobileThemeRuntimeVariables(DEFAULT_MOBILE_THEME_ID, "dark", "ios")["--color-foreground"],
    ).toBe("#123456");
  });

  it("leave the defaults when the distribution's function throws", () => {
    registry.current = {
      themeVariables: () => {
        throw new Error("boom");
      },
    };
    expect(
      getMobileThemeRuntimeVariables(DEFAULT_MOBILE_THEME_ID, "light", "ios")["--color-foreground"],
    ).toBe(defaults.light["--color-foreground"]);
  });
});
