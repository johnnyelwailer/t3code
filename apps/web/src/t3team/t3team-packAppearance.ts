import type { EnvironmentAppearance } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { applyT3TeamPackFavicon, pickT3TeamPackBrandAsset } from "./t3team-packBrand";
import { installT3TeamPackTheme } from "./t3team-packThemeInstall";
import { T3TEAM_PACK_ONLY_COLOR_TOKENS } from "./t3team-packThemeRoles";

/**
 * Colors are NOT painted here any more.
 *
 * Upstream's theme engine owns color: a pack's palette is converted to an upstream
 * `ThemeDefinition` and installed in the theme library (see `t3team-packThemeInstall.ts`), so it
 * is painted by `applyThemePalette` through the `--app-theme-*` roles exactly like T3 Chat or
 * Grove. Writing the derived shadcn variables from here — which is what this file used to do —
 * sat downstream of that derivation and silently defeated the library.
 *
 * What remains here is everything upstream's `ThemeDefinition` cannot express: typography (incl.
 * the brand display face), corner radius, density, and the handful of color tokens upstream
 * deliberately leaves independent (info/success, the sidebar stage fade, the Team header
 * background). `T3TEAM_PACK_ONLY_COLOR_TOKENS` is the authoritative list.
 */
const COLOR_VARIABLES = T3TEAM_PACK_ONLY_COLOR_TOKENS;
const STYLE_ID = "t3team-pack-theme";
let activeAppearance: EnvironmentAppearance | undefined;
let listeners: Array<() => void> = [];

const declarations = (colors: Readonly<Record<string, string>>): string =>
  Object.entries(colors)
    .flatMap(([key, value]) => (COLOR_VARIABLES[key] ? [`${COLOR_VARIABLES[key]}:${value}`] : []))
    .join(";");

function displayFontCss(appearance: EnvironmentAppearance): string {
  const stack = appearance.typography?.display;
  if (!stack) return "";
  const fontFace = appearance.brand?.displayFont
    ? `@font-face{font-family:"T3Team Pack Display";src:url("${appearance.brand.displayFont}");font-weight:100 900;font-display:swap}`
    : "";
  // Headings only by design: display faces trade body-copy readability for character.
  return `${fontFace}
    h1,h2,h3{font-family:var(--t3team-font-display)}`;
}

function themeCss(appearance: EnvironmentAppearance): string {
  const sans = appearance.typography?.sans
    ? `--t3team-font-sans:${appearance.typography.sans};`
    : "";
  const mono = appearance.typography?.mono
    ? `--t3team-font-mono:${appearance.typography.mono};`
    : "";
  const display = appearance.typography?.display
    ? `--t3team-font-display:${appearance.typography.display};`
    : "";
  const radius = appearance.shape?.radius ? `--radius:${appearance.shape.radius};` : "";
  const density = appearance.density ? `font-size:${appearance.density * 100}%;` : "";
  const light = declarations(appearance.colors.light);
  const dark = declarations(appearance.colors.dark);
  return `:root{${light ? `${light};` : ""}${sans}${mono}${display}${radius}${density}}
    :root.dark{${dark}}
    body{font-family:var(--t3team-font-sans,"DM Sans Variable",sans-serif)}
    code,kbd,pre,samp{font-family:var(--t3team-font-mono,"DM Mono",monospace)}
    ${displayFontCss(appearance)}`;
}

export function applyT3TeamPackAppearance(appearance: EnvironmentAppearance | undefined): void {
  activeAppearance = appearance;
  if (typeof document === "undefined") return;
  applyT3TeamPackFavicon(pickT3TeamPackBrandAsset(appearance?.brand, "mark", "light"));
  // Colors go through upstream's theme library; this only paints what it has no role for.
  installT3TeamPackTheme(appearance);
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!appearance) style?.remove();
  else {
    style ??= Object.assign(document.createElement("style"), { id: STYLE_ID });
    style.textContent = themeCss(appearance);
    if (!style.isConnected) document.head.append(style);
    document.documentElement.dataset.t3teamTheme = appearance.themeId;
  }
  for (const listener of listeners) listener();
}

export function useT3TeamPackAppearance(): EnvironmentAppearance | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener);
      };
    },
    () => activeAppearance,
    () => undefined,
  );
}
