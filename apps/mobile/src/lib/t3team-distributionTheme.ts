/**
 * Paints a distribution's pack theme (`extra.nexi.theme`) through the same role path the web app
 * uses: pack tokens overlay upstream's T3 Code roles, and only the mobile variables those roles
 * drive change. Every other variable keeps upstream's tuned default, so a stock build (no
 * `extra.nexi`) and every non-default theme are untouched.
 */
import Constants from "expo-constants";
import {
  T3_CODE_DARK_THEME_COLORS,
  T3_CODE_LIGHT_THEME_COLORS,
  type ThemeColors,
} from "@t3tools/shared/themePalettes";
import { overlayPackThemeColors } from "@t3tools/shared/t3team-packThemeColors";
import {
  createMobileThemeVariables,
  type MobileThemeAppearance,
  type MobileThemeVariables,
} from "./mobileTheme";

type PackColors = Readonly<Record<string, string>>;
export type DistributionThemeColors = Readonly<Record<MobileThemeAppearance, PackColors>>;

function isColorTable(value: unknown): value is PackColors {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((color) => typeof color === "string")
  );
}

export function readDistributionThemeColors(
  extra = Constants.expoConfig?.extra,
): DistributionThemeColors | null {
  const colors: unknown = extra?.nexi?.theme?.colors;
  if (typeof colors !== "object" || colors === null) return null;
  const light: unknown = Reflect.get(colors, "light");
  const dark: unknown = Reflect.get(colors, "dark");
  return isColorTable(light) && isColorTable(dark) ? { light, dark } : null;
}

const DISTRIBUTION_THEME_COLORS = readDistributionThemeColors();

function standardColors(appearance: MobileThemeAppearance): ThemeColors {
  return appearance === "dark" ? T3_CODE_DARK_THEME_COLORS : T3_CODE_LIGHT_THEME_COLORS;
}

function defaultGroupedCard(colors: ThemeColors, appearance: MobileThemeAppearance) {
  return appearance === "light" ? colors.toolbarControlHover : colors.sidebarRowActive;
}

/**
 * Upstream's grouped-card grey is tuned against T3's chrome; a pack chrome close to that grey
 * would hide grouped rows, so a pack that sets its own card surface groups rows on it.
 */
function groupedCard(
  themed: ThemeColors,
  packColors: PackColors,
  appearance: MobileThemeAppearance,
) {
  return packColors.card ? themed.surface : defaultGroupedCard(themed, appearance);
}

function changedVariables(before: MobileThemeVariables, after: MobileThemeVariables) {
  return Object.fromEntries(
    Object.entries(after).filter(([name, value]) => Reflect.get(before, name) !== value),
  );
}

export function withDistributionTheme(
  defaults: MobileThemeVariables,
  appearance: MobileThemeAppearance,
  pack: DistributionThemeColors | null = DISTRIBUTION_THEME_COLORS,
): MobileThemeVariables {
  if (!pack) return defaults;
  const base = standardColors(appearance);
  const themed = overlayPackThemeColors(base, pack[appearance]);
  const before = createMobileThemeVariables(base, appearance, defaultGroupedCard(base, appearance));
  const after = createMobileThemeVariables(
    themed,
    appearance,
    groupedCard(themed, pack[appearance], appearance),
  );
  return { ...defaults, ...changedVariables(before, after) };
}
