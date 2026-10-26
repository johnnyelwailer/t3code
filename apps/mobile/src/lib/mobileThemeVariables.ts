import defaultThemeVariables from "../../generated-uniwind-default-theme-variables.json";
import { mobileExtensions } from "../extensions/t3team-extensions";
import {
  DEFAULT_MOBILE_THEME_ID,
  getMobileThemeVariables,
  themeColorWithAlpha,
  type MobileThemeAppearance,
  type MobileThemeId,
  type MobileThemeVariables,
} from "./mobileTheme";

const defaults = defaultThemeVariables as Readonly<
  Record<MobileThemeAppearance, MobileThemeVariables>
>;

/** The distribution's variables for the default palette; a throwing distribution leaves the defaults. */
function distributionThemeVariables(appearance: MobileThemeAppearance): MobileThemeVariables {
  try {
    return (
      mobileExtensions.themeVariables?.(defaults[appearance], appearance) ?? defaults[appearance]
    );
  } catch (error) {
    console.warn("The distribution's theme variables failed; using the defaults.", error);
    return defaults[appearance];
  }
}

export function getMobileThemeRuntimeVariables(
  themeId: MobileThemeId,
  appearance: MobileThemeAppearance,
  platform: string,
): MobileThemeVariables {
  const usesDefaultPalette = themeId === DEFAULT_MOBILE_THEME_ID || themeId === "material-you";
  const variables = usesDefaultPalette
    ? distributionThemeVariables(appearance)
    : getMobileThemeVariables(themeId, appearance);
  const frame = themeColorWithAlpha(
    variables[usesDefaultPalette ? "--color-row-hover" : "--color-drawer"],
    1,
  );
  if (platform === "ios" && usesDefaultPalette && appearance === "light") {
    return {
      ...variables,
      "--color-header": frame,
      "--color-header-foreground": variables["--color-drawer-foreground"],
      "--color-drawer": frame,
      "--color-drawer-foreground-muted": variables["--color-foreground-muted"],
    };
  }
  if (platform !== "android") return variables;

  return {
    ...variables,
    "--color-header": frame,
    "--color-header-foreground": variables["--color-drawer-foreground"],
    "--color-drawer": variables["--color-screen"],
  };
}
