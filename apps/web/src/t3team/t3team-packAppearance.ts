import type { EnvironmentAppearance } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { applyT3TeamPackFavicon, pickT3TeamPackBrandAsset } from "./t3team-packBrand";
import { installT3TeamPackTheme } from "./t3team-packThemeInstall";
import {
  T3TEAM_PACK_DERIVED_OVERRIDE_TOKENS,
  T3TEAM_PACK_ONLY_COLOR_TOKENS,
} from "./t3team-packThemeRoles";

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
 * the brand display face), corner radius, and two groups of colors — the ones upstream leaves
 * independent, and the few it derives from a role the pack cannot address separately. The two
 * groups need DIFFERENT selectors (see `t3team-packThemeRoles.ts`), which is why they are emitted
 * as separate rules rather than one block.
 */
const STYLE_ID = "t3team-pack-theme";
let activeAppearance: EnvironmentAppearance | undefined;
let listeners: Array<() => void> = [];

const declarationsFor =
  (variables: Readonly<Record<string, string>>) =>
  (colors: Readonly<Record<string, string>>): string =>
    Object.entries(colors)
      .flatMap(([key, value]) => (variables[key] ? [`${variables[key]}:${value}`] : []))
      .join(";");

/** Independent tokens: `:root` is enough, nothing downstream re-derives them. */
const declarations = declarationsFor(T3TEAM_PACK_ONLY_COLOR_TOKENS);
/** Derived tokens: need the theme block's specificity to beat `html[data-theme-id]`. */
const overrideDeclarations = declarationsFor(T3TEAM_PACK_DERIVED_OVERRIDE_TOKENS);

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
  // Pack fonts declare upstream's OWN variables, and do it from a stylesheet on purpose.
  // `applyAppearanceFontVariables` writes `--font-sans`/`--font-mono` as INLINE styles on <html>
  // only when the user picked a font, and removes them otherwise — so an inline (user) value
  // outranks this stylesheet automatically, and the pack supplies the brand default when the user
  // has not chosen. Declaring fork-private `--t3team-font-*` and then forcing them onto `body`
  // (what this used to do) inverted that: Settings → Appearance → Font became a no-op under a pack.
  const sans = appearance.typography?.sans ? `--font-sans:${appearance.typography.sans};` : "";
  const mono = appearance.typography?.mono ? `--font-mono:${appearance.typography.mono};` : "";
  const display = appearance.typography?.display
    ? `--t3team-font-display:${appearance.typography.display};`
    : "";
  const radius = appearance.shape?.radius ? `--radius:${appearance.shape.radius};` : "";
  // NOTE: `density` is deliberately NOT emitted as `font-size:%` any more. Upstream sets
  // `root.style.fontSize` inline and unconditionally, so a stylesheet percentage never won —
  // pack density was silently dead. It now seeds the user's interface font size once, via
  // `appearanceDefaults` (see t3team-packAppearanceDefaults.ts).
  const light = declarations(appearance.colors.light);
  const dark = declarations(appearance.colors.dark);
  const lightOverride = overrideDeclarations(appearance.colors.light);
  const darkOverride = overrideDeclarations(appearance.colors.dark);
  return `:root{${light ? `${light};` : ""}${sans}${mono}${display}${radius}}
    :root.dark{${dark}}
    html[data-theme-id]{${lightOverride}}
    html.dark[data-theme-id]{${darkOverride}}
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
