import { useId } from "react";

import { useTheme } from "~/hooks/useTheme";

/**
 * Soft white wash that fades in from the LEFT edge of the strip, for the one composition where the
 * orb parks behind the native macOS traffic lights. In the light appearance the red close button
 * muddies out on the pale orb fill, so the wash lifts the button row without touching the
 * composition. Active only when the resolved theme appearance is light; renders nothing otherwise.
 *
 * Strength is token-driven so a story or a pack retunes it without code:
 *   `--stage-nx-fade-opacity`  default 0.55 (0 disables the wash)
 *   `--stage-nx-fade-width`    default 140px, the distance from the left edge where it reaches zero
 */
export const FADE_OPACITY = 0.55;
export const FADE_WIDTH_PX = 140;

/** Read a custom property as a number, falling back when missing or malformed. */
export function cssNumberPx(style: CSSStyleDeclaration, name: string, fallback: number): number {
  const value = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Rendered INSIDE the strip's `<svg>` (after the orb group, so it sits above the orb and the
 * ground). `widthUnits` is the fade width converted to viewBox units by the strip's measurement.
 */
export function NexploreTitlebarFade({ opacity, widthUnits }: { opacity: number; widthUnits: number }) {
  const { resolvedTheme } = useTheme();
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (resolvedTheme !== "light" || opacity <= 0 || widthUnits <= 0) return null;
  return (
    <>
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2={widthUnits}
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ffffff" stopOpacity={opacity} />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${gradientId})`} />
    </>
  );
}
