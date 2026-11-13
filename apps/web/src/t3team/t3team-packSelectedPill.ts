import { needsSolidSelection } from "@t3tools/shared/t3team-selectionContrast";

export const SELECTED_PILL_ATTRIBUTE = "data-t3team-pill-selected";

type PackModeColors = Readonly<Record<string, string>>;

const SOLID_SELECTED_PILL =
  "background-color:var(--primary);border-color:var(--foreground);color:var(--primary-foreground)";

function backdropsOf(colors: PackModeColors): string[] {
  return [colors.background, colors.card, colors.appChromeBackground].filter(
    (color): color is string => color !== undefined,
  );
}

function solidPillRule(prefix: string, colors: PackModeColors): string {
  const accent = colors.primary;
  if (accent === undefined || !needsSolidSelection(accent, backdropsOf(colors))) return "";
  return `${prefix} [${SELECTED_PILL_ATTRIBUTE}]{${SOLID_SELECTED_PILL}}`;
}

/** Pale accents (Lila on light) cannot carry a tint and a ring, so the selected pill goes solid. */
export function solidSelectedPillCss(
  colors: { readonly light: PackModeColors; readonly dark: PackModeColors },
  themeSelector: string,
): string {
  return [
    solidPillRule(`html:not(.dark)${themeSelector}`, colors.light),
    solidPillRule(`html.dark${themeSelector}`, colors.dark),
  ].join("\n");
}
