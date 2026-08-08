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

import { readThemePreference, writeThemePreference } from "~/hooks/useTheme";
import {
  applyThemePalette,
  getCustomThemes,
  installCustomTheme,
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
  writeThemePreference(definition.id);
  applyThemePalette(definition.id);
}

/** True when the user is currently wearing a pack-provided theme. */
export function isWearingT3TeamPackTheme(): boolean {
  if (typeof window === "undefined") return false;
  return isT3TeamPackThemeId(readThemePreference());
}

export { t3teamPackThemeId };
