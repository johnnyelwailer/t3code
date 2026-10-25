/**
 * The pack-token → upstream-theme-role map, shared by every client that paints a pack theme.
 *
 * A pack authors colors in the shadcn vocabulary (`background`, `card`, `primary`, …). Upstream's
 * theme engine authors them as ROLES (`canvas`, `surface`, `messageAction`, …) and derives each
 * client's variables from them. Mapping up to roles is what puts a pack theme and the built-in
 * theme library on one path, on web and on mobile alike.
 *
 * Each entry was read off the web derivation block in `apps/web/src/index.css`; the non-obvious
 * ones are commented.
 */
import type { ThemeColorRole, ThemeColors } from "./themePalettes.ts";

export const T3TEAM_PACK_TOKEN_TO_THEME_ROLE = {
  background: "canvas",
  foreground: "text",
  card: "surface",
  popover: "surfaceOverlay",
  // `--primary` derives from the message ACTION color, not from `accent`: upstream routes every
  // solid CTA (send button, switches, sliders) through the action role, while `accent` drives
  // surfaces and selection. Mapping `primary` to `accent` would recolor selection instead.
  primary: "messageAction",
  primaryForeground: "messageActionForeground",
  secondary: "secondary",
  secondaryForeground: "secondaryForeground",
  muted: "muted",
  // `--muted-foreground` derives from `textMuted`, not from a `mutedForeground` role.
  mutedForeground: "textMuted",
  // shadcn's `accent`/`accent-foreground` are the SURFACE pair upstream calls accentSurface*.
  accent: "accentSurface",
  accentForeground: "accentSurfaceForeground",
  // `--destructive` is an alias of `--error` upstream.
  destructive: "error",
  destructiveForeground: "errorForeground",
  border: "border",
  input: "input",
  // `--ring` derives from the focus role.
  ring: "focus",
  warning: "warning",
  warningForeground: "warningForeground",
  appChromeBackground: "chrome",
  sidebar: "sidebar",
  sidebarForeground: "sidebarForeground",
  sidebarMutedForeground: "sidebarMutedForeground",
  sidebarControlSurface: "sidebarControlSurface",
  sidebarRowHover: "sidebarRowHover",
  sidebarRowActive: "sidebarRowActive",
  sidebarRowSelected: "sidebarRowSelected",
  sidebarBorder: "sidebarBorder",
} as const satisfies Readonly<Record<string, ThemeColorRole>>;

export type T3TeamPackThemeToken = keyof typeof T3TEAM_PACK_TOKEN_TO_THEME_ROLE;

const PACK_TOKEN_ROLES = Object.entries(T3TEAM_PACK_TOKEN_TO_THEME_ROLE);

/** Overlays one appearance's pack tokens onto `base`; roles the pack leaves unset keep `base`. */
export function overlayPackThemeColors(
  base: ThemeColors,
  packColors: Readonly<Record<string, string>>,
): ThemeColors {
  const colors: Record<ThemeColorRole, string> = { ...base };
  for (const [token, role] of PACK_TOKEN_ROLES) {
    const value = packColors[token];
    if (typeof value === "string" && value.length > 0) colors[role] = value;
  }
  return colors;
}
