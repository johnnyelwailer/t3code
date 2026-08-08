/**
 * Puts a pack's palette INTO upstream's theme library, then gets out of the way.
 *
 * The deal, deliberately "a mix of both":
 *  - the pack theme is a REAL library entry — it shows up in Settings → Appearance beside T3 Chat
 *    and Grove, it is painted by `applyThemePalette`, it honours light/dark and follow-system, and
 *    the user can switch away from it. One code path, no parallel painter.
 *  - the distribution still owns the STARTING look: the first time a given pack palette is seen,
 *    it is selected. That is apply-once, keyed by the palette's content — the same
 *    marker discipline `t3team-packAppearanceDefaults.ts` uses for lens/glass, and for the same
 *    reason: re-asserting on every load would silently undo a user who chose another theme.
 *  - capabilities upstream's ThemeDefinition cannot carry (brand assets, typography, radius,
 *    density, info/success) stay on the fork's own style element. See `t3team-packAppearance.ts`.
 *
 * A redeploy of the SAME palette changes nothing; shipping a changed palette gets exactly one
 * fresh chance to move the starting point.
 */
import type { EnvironmentAppearance } from "@t3tools/contracts";

import {
  readAppearanceModePreference,
  readThemeHalves,
  readThemePreference,
  writeThemePreference,
} from "~/hooks/useTheme";
import {
  applyThemePalette,
  getCustomThemes,
  installCustomTheme,
  resolveThemeAppearance,
  resolveThemeHalf,
  THEME_APPEARANCE_MODE_STORAGE_KEY,
  updateCustomTheme,
} from "~/themePalette";

import {
  isT3TeamPackThemeId,
  t3teamPackThemeDefinition,
  t3teamPackThemeId,
} from "./t3team-packThemeDefinition";

export const T3TEAM_PACK_THEME_APPLIED_STORAGE_KEY = "t3team:pack-theme-applied";

/** Identity of one palette: the theme id plus a digest of the colors themselves. */
export function t3teamPackThemeMarker(appearance: EnvironmentAppearance): string {
  const halves = JSON.stringify([appearance.colors.light, appearance.colors.dark]);
  let hash = 0;
  for (let index = 0; index < halves.length; index += 1) {
    hash = (Math.imul(31, hash) + halves.charCodeAt(index)) | 0;
  }
  return `${appearance.themeId}|${hash.toString(36)}`;
}

function readAppliedMarker(): string | null {
  try {
    return window.localStorage.getItem(T3TEAM_PACK_THEME_APPLIED_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeAppliedMarker(marker: string): void {
  try {
    window.localStorage.setItem(T3TEAM_PACK_THEME_APPLIED_STORAGE_KEY, marker);
  } catch {
    // A browser refusing storage is not a reason to leave the app unthemed; the only cost is
    // re-selecting the pack theme on the next load.
  }
}

/**
 * Register (or refresh) the pack theme and, on first sight of this palette, select it.
 * Safe to call on every appearance change: installation is idempotent and selection is markered.
 */
export function installT3TeamPackTheme(appearance: EnvironmentAppearance | undefined): void {
  if (typeof window === "undefined" || !appearance) return;

  const definition = t3teamPackThemeDefinition({
    themeId: appearance.themeId,
    name: appearance.name,
    defaultMode: appearance.defaultMode,
    colors: appearance.colors,
  });

  // Keep the library entry current even when the selection marker says "already applied" — a
  // redeployed pack with tweaked colors should refresh the stored palette, not strand an old one.
  //
  // Deliberately UNCONDITIONAL. Skipping the write when the palette looks unchanged is tempting
  // (this runs on every server-config emission, and each write is a stringify + localStorage set +
  // broadcast), but the only cheap "has it changed?" source is `getCustomThemes()`, which returns
  // a memoized snapshot that can outlive the storage it came from. Guarding on it means a cleared
  // or evicted storage with a warm snapshot never re-persists, and the palette silently stops
  // surviving reloads — the exact failure this whole path exists to prevent. The write is cheap;
  // the missing write is not.
  const alreadyInstalled = getCustomThemes().some((theme) => theme.id === definition.id);
  try {
    if (alreadyInstalled) updateCustomTheme(definition);
    else installCustomTheme(definition);
  } catch {
    // Storage full or unavailable — fall through to painting, which needs no persistence.
  }

  const marker = t3teamPackThemeMarker(appearance);
  if (readAppliedMarker() === marker) {
    // Honour the user's current choice. If that choice IS this pack theme, upstream's own boot
    // path has already painted it; nothing to do.
    return;
  }

  writeAppliedMarker(marker);
  try {
    writeThemePreference(definition.id);
    seedAppearanceMode(appearance.defaultMode);
  } catch {
    // A storage-blocked browser must not throw out of the appearance effect; the palette is still
    // painted below, it just won't be remembered across loads.
  }
  applySelectedPackTheme(definition.id);
}

/**
 * Carry the pack's `defaultMode` into upstream's appearance-mode preference, once.
 *
 * Without this the pack's declared mode is simply ignored: `readAppearanceModePreference` falls
 * back to `getThemePreferenceMode(theme) ?? "light"`, and a custom theme's nominal appearance is
 * "light" — so a pack asking for `system` would never follow the OS. Written only when the user
 * has no stored mode, because this is a user-owned preference the distribution may only seed.
 */
function seedAppearanceMode(defaultMode: EnvironmentAppearance["defaultMode"]): void {
  if (defaultMode === undefined) return;
  if (window.localStorage.getItem(THEME_APPEARANCE_MODE_STORAGE_KEY) !== null) return;
  window.localStorage.setItem(THEME_APPEARANCE_MODE_STORAGE_KEY, defaultMode);
}

/**
 * Paint the selected theme the way upstream's own `applyTheme` does.
 *
 * `applyThemePalette(id)` ALONE is not enough and the difference is invisible in tests: with no
 * appearance argument it falls back to the definition's nominal appearance ("light" for a pack
 * whose `defaultMode` is "system"), and it does not touch the `dark` class. On a machine in dark
 * mode that paints the light palette while `<html>` still carries `.dark`, so every `dark:`
 * utility and `color-scheme` rule renders its dark variant over light colors.
 *
 * Upstream's `applyTheme` is module-private, so this mirrors it with the exported resolvers.
 */
function applySelectedPackTheme(themeId: string): void {
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

/** True when the user is currently wearing a pack-provided theme. */
export function isWearingT3TeamPackTheme(): boolean {
  if (typeof window === "undefined") return false;
  return isT3TeamPackThemeId(readThemePreference());
}

export { t3teamPackThemeId };
