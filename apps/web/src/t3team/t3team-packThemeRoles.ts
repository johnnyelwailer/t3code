/**
 * Web-only pack color tokens. The pack-token → theme-role map itself is shared with mobile and
 * lives in `@t3tools/shared/t3team-packThemeColors`; it is re-exported here for existing callers.
 *
 * Painting the shadcn variables directly — which is what the fork used to do — lands *downstream*
 * of `index.css`'s `html[data-theme-id]` derivation, so a pack silently defeated the theme
 * library. Tokens with no upstream role are listed in `T3TEAM_PACK_ONLY_COLOR_TOKENS` and stay on
 * the fork's own (now colors-free-except-these) style element.
 */
export {
  T3TEAM_PACK_TOKEN_TO_THEME_ROLE,
  type T3TeamPackThemeToken,
} from "@t3tools/shared/t3team-packThemeColors";

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
