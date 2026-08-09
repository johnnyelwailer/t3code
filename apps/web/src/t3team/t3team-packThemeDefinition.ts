/**
 * Converts a pack's appearance into ONE upstream `ThemeDefinition`, so a distribution theme is a
 * first-class member of the theme library rather than a parallel paint path.
 *
 * Shape of the result: a single definition carrying both halves via `variants` ({ light, dark }),
 * which is exactly how upstream's built-ins (T3 Chat, Grove, …) express light/dark. Each half
 * starts from `getStandardThemeColors(appearance)` so every role the pack does NOT specify keeps a
 * coherent upstream value — a pack that only sets a background and an accent still yields a
 * complete, legible palette instead of a half-painted one.
 *
 * Pure: no DOM, no storage. Installing/selecting it is `t3team-packAppearance.ts`'s job.
 */
import {
  getStandardThemeColors,
  type ThemeAppearance,
  type ThemeColors,
  type ThemeDefinition,
} from "~/themePalette";

import {
  T3TEAM_PACK_TOKEN_TO_THEME_ROLE,
  type T3TeamPackThemeToken,
} from "./t3team-packThemeRoles";

/** The subset of `EnvironmentAppearance` this converter needs. */
export type T3TeamPackThemeInput = {
  readonly themeId: string;
  readonly name?: string | undefined;
  readonly defaultMode?: "light" | "dark" | "system" | undefined;
  readonly colors: {
    readonly light: Readonly<Record<string, string>>;
    readonly dark: Readonly<Record<string, string>>;
  };
};

/** Theme ids a distribution may not claim — upstream reserves them for its own built-ins. */
const RESERVED_PREFIXES = new Set(["system", "light", "dark"]);

/**
 * Pack theme ids are namespaced so a pack can never collide with (or be mistaken for) a built-in
 * or a user-authored theme, and so the "is the current theme the pack's?" check is a prefix test.
 *
 * The separator is a HYPHEN, not a colon: upstream validates stored theme ids with
 * `/^[a-z0-9](?:[a-z0-9-]{0,47})$/` (`themePalette.ts` `isThemeId`) when re-reading them from
 * localStorage. A colon passes `installCustomTheme` (which only checks reserved ids) and works
 * in-memory, then fails `parseStoredTheme` on the NEXT load — the theme is silently dropped from
 * the library, the preference falls back to "system", and the distribution's palette disappears
 * after first run. Keep this matching `isThemeId`.
 */
export const T3TEAM_PACK_THEME_ID_PREFIX = "t3team-pack-";

export function t3teamPackThemeId(packThemeId: string): string {
  return `${T3TEAM_PACK_THEME_ID_PREFIX}${packThemeId}`;
}

export function isT3TeamPackThemeId(themeId: string): boolean {
  return themeId.startsWith(T3TEAM_PACK_THEME_ID_PREFIX);
}

/** Overlay one half's pack tokens onto the upstream standard palette for that appearance. */
function packColorsForAppearance(
  appearance: ThemeAppearance,
  packColors: Readonly<Record<string, string>>,
): ThemeColors {
  const base = { ...getStandardThemeColors(appearance) };
  for (const [token, role] of Object.entries(T3TEAM_PACK_TOKEN_TO_THEME_ROLE) as Array<
    [T3TeamPackThemeToken, ThemeColors extends Readonly<Record<infer R, string>> ? R : never]
  >) {
    const value = packColors[token];
    if (typeof value === "string" && value.length > 0) {
      base[role] = value;
    }
  }
  return base;
}

/**
 * The appearance a pack theme opens in. `system` is not a paintable half, so it resolves to the
 * light variant as the definition's nominal appearance; upstream's follow-system handling then
 * picks the right half at runtime from `variants`.
 */
function nominalAppearance(defaultMode: T3TeamPackThemeInput["defaultMode"]): ThemeAppearance {
  return defaultMode === "dark" ? "dark" : "light";
}

export function t3teamPackThemeDefinition(pack: T3TeamPackThemeInput): ThemeDefinition {
  if (RESERVED_PREFIXES.has(pack.themeId)) {
    throw new Error(`Pack theme id "${pack.themeId}" is reserved.`);
  }
  const light = packColorsForAppearance("light", pack.colors.light);
  const dark = packColorsForAppearance("dark", pack.colors.dark);
  const appearance = nominalAppearance(pack.defaultMode);
  return {
    id: t3teamPackThemeId(pack.themeId),
    label: pack.name ?? pack.themeId,
    appearance,
    colors: appearance === "dark" ? dark : light,
    variants: { light, dark },
  };
}
