import type { T3TeamPackBrandAssets } from "./t3team-packBrand";
import { pickT3TeamPackBrandAsset } from "./t3team-packBrand";

/**
 * Renders a pack brand mark or wordmark, switching to the dark variant via CSS
 * so it stays in sync with the root `.dark` class without re-rendering.
 *
 * `onBackdrop` exists because the variant a brand asset needs depends on the SURFACE it sits on,
 * not on the theme mode — and over stage art the surface is inverted relative to the page. The
 * nexplore duo makes this concrete: the day ground is Orange (`#f05a0a`, the mark's own colour, so
 * the default choice paints orange onto orange and the logo vanishes) while the night ground is
 * Blau. So on a backdrop the pair is simply SWAPPED: the `-dark` (white) asset in light mode, the
 * base (orange) asset in dark mode. That also matches the brand portal, which sets
 * `--logo-color: var(--nx-orange)` in brand-night as well as brand-day.
 */
export function T3TeamPackBrandImage({
  brand,
  kind,
  className,
  alt = "",
  onBackdrop = false,
}: {
  brand: T3TeamPackBrandAssets | undefined;
  kind: "mark" | "wordmark";
  className?: string;
  alt?: string;
  onBackdrop?: boolean;
}) {
  const light = pickT3TeamPackBrandAsset(brand, kind, "light");
  const dark = pickT3TeamPackBrandAsset(brand, kind, "dark");
  if (!light && !dark) return null;
  if (!dark || dark === light) {
    return <img src={light ?? dark} alt={alt} className={className} />;
  }
  // Over stage art the ground is inverted relative to the page, so swap which asset each mode gets.
  const [inLightMode, inDarkMode] = onBackdrop ? [dark, light] : [light, dark];
  // Each side stays conditional: the contract allows a dark-only brand (`wordmarkDark` with no
  // `wordmark`), and rendering `<img src={undefined}>` would occupy layout and show a broken image.
  return (
    <>
      {inLightMode ? (
        <img src={inLightMode} alt={alt} className={`dark:hidden ${className ?? ""}`} />
      ) : null}
      {inDarkMode ? (
        <img src={inDarkMode} alt={alt} className={`hidden dark:block ${className ?? ""}`} />
      ) : null}
    </>
  );
}
