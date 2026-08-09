/**
 * The pack-token → upstream-theme-role map.
 *
 * A pack authors colors in the shadcn vocabulary (`background`, `card`, `primary`, …). Upstream's
 * theme engine authors them as ROLES (`canvas`, `surface`, `messageAction`, …) and derives the
 * shadcn variables from them in `index.css` under `html[data-theme-id]`. Painting the shadcn
 * variables directly — which is what the fork used to do — lands *downstream* of that derivation,
 * so a pack silently defeated the theme library. Mapping up to roles is what puts both on one path.
 *
 * Each entry below was read off the derivation block in `apps/web/src/index.css`; the non-obvious
 * ones are commented. Tokens with no upstream role are listed in `T3TEAM_PACK_ONLY_COLOR_TOKENS`
 * and stay on the fork's own (now colors-free-except-these) style element.
 */
import type { ThemeColorRole } from "~/themePalette";

/** Pack color token → the upstream role that ultimately drives it. */
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

/**
 * Pack tokens upstream's palette has no role for — `index.css` says as much: "Success, info,
 * provider, and channel identity colors remain independent". These are applied by the fork's own
 * style element at `:root`, which is now the ONLY thing it paints besides typography/shape.
 *
 * Membership here is load-bearing and easy to get wrong: a token that upstream DOES derive inside
 * `html[data-theme-id]` cannot be overridden from `:root`, because the theme block's selector has
 * higher specificity ((0,1,1) vs (0,1,0)) and `data-theme-id` is always set once a theme is
 * selected. Such a token belongs in `T3TEAM_PACK_DERIVED_OVERRIDE_TOKENS` below, not here.
 */
export const T3TEAM_PACK_ONLY_COLOR_TOKENS: Readonly<Record<string, string>> = {
  info: "--info",
  infoForeground: "--info-foreground",
  success: "--success",
  successForeground: "--success-foreground",
  // Raw CSS value (color, gradient, or url(...)) applied via `background` on the Team sidebar
  // header's background layer; unset falls back to transparent.
  sidebarHeaderBackground: "--t3team-sidebar-header-background",
};

/**
 * Pack tokens that upstream DOES derive from a role, but from a role the pack cannot address
 * independently — `--card-foreground` and `--popover-foreground` both come from `text`, and
 * `--sidebar-stage-fade` from `sidebar`. A pack that wants these to differ from their source has
 * to out-specify the derivation, so they are emitted under `html[data-theme-id]` (matching the
 * theme block's specificity, and winning on document order because the fork's style element is
 * appended at runtime).
 */
export const T3TEAM_PACK_DERIVED_OVERRIDE_TOKENS: Readonly<Record<string, string>> = {
  cardForeground: "--card-foreground",
  popoverForeground: "--popover-foreground",
  sidebarStageFade: "--sidebar-stage-fade",
};
