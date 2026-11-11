/**
 * True when an accent is too pale for a tint and a thin ring to show (Lila on light), so the
 * selected pill goes solid with a dark border. Web and phone share this one rule.
 * Ring contrast: 1.35 to 3.25 for the shipped themes except Lila on light, which reads 1.06 to 1.10.
 */
export const QUIET_SELECTION_MIN_RING_CONTRAST = 1.2;
const QUIET_RING_ALPHA = 0.4;

type Channels = readonly [number, number, number];

function parseColor(color: string): { readonly rgb: Channels; readonly alpha: number } | null {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim());
  if (hex?.[1]) {
    const digits =
      hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit) : hex[1].match(/../g);
    const [red = "0", green = "0", blue = "0"] = digits ?? [];
    return {
      rgb: [Number.parseInt(red, 16), Number.parseInt(green, 16), Number.parseInt(blue, 16)],
      alpha: 1,
    };
  }
  const fn = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(color.trim());
  if (!fn) return null;
  return {
    rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])],
    alpha: fn[4] === undefined ? 1 : Number(fn[4]),
  };
}

function luminance([red, green, blue]: Channels): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

export function contrastBetween(first: Channels, second: Channels): number {
  const [a, b] = [luminance(first), luminance(second)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function ringOver(accent: Channels, backdrop: Channels): Channels {
  const blend = (index: 0 | 1 | 2) =>
    Math.round(accent[index] * QUIET_RING_ALPHA + backdrop[index] * (1 - QUIET_RING_ALPHA));
  return [blend(0), blend(1), blend(2)];
}

/** True when the accent's ring is faint on any of the backdrops; unreadable colours count as fine. */
export function needsSolidSelection(accent: string, backdrops: ReadonlyArray<string>): boolean {
  const parsedAccent = parseColor(accent);
  if (!parsedAccent) return false;
  return backdrops.some((backdrop) => {
    const parsedBackdrop = parseColor(backdrop);
    if (!parsedBackdrop) return false;
    const ring = ringOver(parsedAccent.rgb, parsedBackdrop.rgb);
    return contrastBetween(ring, parsedBackdrop.rgb) < QUIET_SELECTION_MIN_RING_CONTRAST;
  });
}
