/**
 * Painting a selected theme the way upstream's own `applyTheme` does.
 *
 * Split from `t3team-packThemeInstall.ts` because it answers a different question: that file
 * decides WHETHER the pack theme should be selected (install, marker, apply-once); this one is
 * purely HOW to select one correctly. The distinction matters because getting "how" wrong is
 * invisible — the palette still appears, just in the wrong half.
 *
 * Upstream's `applyTheme` is module-private in `hooks/useTheme.ts`, so this mirrors it with the
 * exported resolvers. Keep the two in step: if upstream's version grows a step, this needs it too.
 */
import type { EnvironmentAppearance } from "@t3tools/contracts";

import { readAppearanceModePreference, readThemeHalves } from "~/hooks/useTheme";
import {
  applyThemePalette,
  resolveThemeAppearance,
  resolveThemeHalf,
  THEME_APPEARANCE_MODE_STORAGE_KEY,
} from "~/themePalette";

/**
 * Carry the pack's `defaultMode` into upstream's appearance-mode preference, once.
 *
 * Without this the pack's declared mode is simply ignored: `readAppearanceModePreference` falls
 * back to `getThemePreferenceMode(theme) ?? "light"`, and a custom theme's nominal appearance is
 * "light" — so a pack asking for `system` would never follow the OS. Written only when the user
 * has no stored mode, because this is a user-owned preference the distribution may only seed.
 */
export function seedT3TeamPackAppearanceMode(
  defaultMode: EnvironmentAppearance["defaultMode"],
): void {
  if (defaultMode === undefined) return;
  if (window.localStorage.getItem(THEME_APPEARANCE_MODE_STORAGE_KEY) !== null) return;
  window.localStorage.setItem(THEME_APPEARANCE_MODE_STORAGE_KEY, defaultMode);
}

/**
 * Select a theme and paint it.
 *
 * `applyThemePalette(id)` ALONE is not enough, and the difference is invisible in a snapshot test:
 * with no appearance argument it falls back to the definition's nominal appearance ("light" for a
 * pack whose `defaultMode` is "system") and it does not touch the `dark` class. On a machine in
 * dark mode that paints the light palette while `<html>` still carries `.dark`, so every `dark:`
 * utility and `color-scheme` rule renders its dark variant over light colors.
 */
export function applyT3TeamSelectedTheme(themeId: string): void {
  const appearanceMode = readAppearanceModePreference(themeId);
  const followSystem = appearanceMode === "system";
  const systemDark =
    followSystem && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
  const halves = readThemeHalves();
  const appearance = resolveThemeAppearance(
    themeId,
    systemDark,
    followSystem,
    appearanceMode,
    halves,
  );
  applyThemePalette(resolveThemeHalf(themeId, halves, appearance), appearance);
  document.documentElement.classList.toggle("dark", appearance === "dark");
}
