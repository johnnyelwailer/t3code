/**
 * Narrow host protection for persisted HTML widgets.
 *
 * Widget guidance asks authors to use theme tokens, but saved widgets can predate that guidance.
 * Normalize only common neutral surface/default-text declarations; semantic colours such as
 * green and orange are deliberately left alone. The host CSS is appended after the raw fragment
 * so ordinary author styles cannot reintroduce the iframe's light default text or wide table
 * layout. `overflow: auto` remains the fallback for content that is intrinsically oversized.
 */

const MUTED_SURFACE = "var(--muted, var(--background, transparent))";
const CARD_SURFACE = "var(--card, var(--background, transparent))";
const FOREGROUND = "var(--foreground, inherit)";

const LIGHT_SURFACE_COLORS: Readonly<Record<string, string>> = {
  "#f5f5f5": MUTED_SURFACE,
  "#f0f0f0": MUTED_SURFACE,
  "#fafafa": MUTED_SURFACE,
  "rgb(245,245,245)": MUTED_SURFACE,
  "rgb(240,240,240)": MUTED_SURFACE,
  "rgb(250,250,250)": MUTED_SURFACE,
  "#fff": CARD_SURFACE,
  "#ffffff": CARD_SURFACE,
  "rgb(255,255,255)": CARD_SURFACE,
  white: CARD_SURFACE,
};

const DEFAULT_TEXT_COLORS: Readonly<Record<string, string>> = {
  "#1f2328": FOREGROUND,
  "#24292f": FOREGROUND,
  "#212529": FOREGROUND,
  "#333": FOREGROUND,
  "#333333": FOREGROUND,
  "#000": FOREGROUND,
  "#000000": FOREGROUND,
  "rgb(31,35,40)": FOREGROUND,
  "rgb(51,51,51)": FOREGROUND,
  "rgb(0,0,0)": FOREGROUND,
  black: FOREGROUND,
};

/** Host CSS keeps the common table path fluid while retaining scrolling as an overflow escape hatch. */
export const T3TEAM_WIDGET_HOST_CSS = [
  "html, body { min-width: 0; max-width: 100%; }",
  `body { color: ${FOREGROUND} !important; background: transparent !important; overflow: auto; }`,
  "table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; border-collapse: collapse; }",
  "table th, table td { min-width: 0; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; white-space: normal !important; }",
  "pre { max-width: 100%; overflow-x: auto; }",
].join(" ");

const CSS_COLOR_DECLARATION =
  /(?<![-\w])((?:background(?:-color)?|color)\s*:\s*)([^;}]*?)(?=\s*[;}"']|$)/gi;

function colorKey(value: string): string {
  return value.toLowerCase().replaceAll(/\s+/g, "");
}

function normalizeDeclarationValue(value: string, property: string): string | undefined {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  let core = value.slice(leading.length, value.length - trailing.length);
  const important = core.match(/\s*!important$/i)?.[0] ?? "";
  if (important) core = core.slice(0, -important.length).trim();

  const replacements = property.toLowerCase().startsWith("background")
    ? LIGHT_SURFACE_COLORS
    : DEFAULT_TEXT_COLORS;
  const replacement = replacements[colorKey(core)];
  if (!replacement) return undefined;
  return `${leading}${replacement}${important}${trailing}`;
}

/** Replace only exact neutral CSS declarations, leaving semantic and arbitrary colours untouched. */
export function normalizeT3TeamWidgetHtml(html: string): string {
  return html.replace(CSS_COLOR_DECLARATION, (declaration, prefix: string, value: string) => {
    const property = prefix.slice(0, prefix.indexOf(":"));
    const normalized = normalizeDeclarationValue(value, property);
    return normalized === undefined ? declaration : `${prefix}${normalized}`;
  });
}
