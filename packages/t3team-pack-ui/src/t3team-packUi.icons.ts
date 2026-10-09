/**
 * `pack-ui:1` icons. A pack names an icon; the host draws it from its own icon set, so the set can
 * change under every pack at once. Names follow the host set's (lucide) kebab-case names. Adding a
 * name is compatible; removing or renaming one is a `PACK_UI_VERSION` bump.
 */
export type PackIconName =
  | "check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "chevrons-down-up"
  | "chevrons-up-down"
  | "circle"
  | "circle-check"
  | "clock"
  | "code"
  | "copy"
  | "external-link"
  | "flask-conical"
  | "git-branch"
  | "history"
  | "image-off"
  | "info"
  | "lightbulb"
  | "message-circle-question"
  | "message-square-plus"
  | "pause"
  | "pencil-line"
  | "play"
  | "refresh-cw"
  | "reply"
  | "shield-alert"
  | "sparkles"
  | "triangle-alert"
  | "x";

/**
 * Inside a `Button` the button sizes and colours the glyph; give no `className`. Elsewhere
 * `className` sizes, places and colours it (`size-3.5 text-muted-foreground`). Decorative unless
 * it has an `aria-label`.
 */
export interface PackIconProps {
  readonly name: PackIconName;
  readonly className?: string;
  readonly "aria-label"?: string;
}
