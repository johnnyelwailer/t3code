import type { T3workPackBrandAssets } from "./t3work-packBrand";
import { pickT3workPackBrandAsset } from "./t3work-packBrand";

/**
 * Renders a pack brand mark or wordmark, switching to the dark variant via CSS
 * so it stays in sync with the root `.dark` class without re-rendering.
 */
export function T3workPackBrandImage({
  brand,
  kind,
  className,
  alt = "",
}: {
  brand: T3workPackBrandAssets | undefined;
  kind: "mark" | "wordmark";
  className?: string;
  alt?: string;
}) {
  const light = pickT3workPackBrandAsset(brand, kind, "light");
  const dark = pickT3workPackBrandAsset(brand, kind, "dark");
  if (!light && !dark) return null;
  if (!dark || dark === light) {
    return <img src={light ?? dark} alt={alt} className={className} />;
  }
  return (
    <>
      {light ? <img src={light} alt={alt} className={`dark:hidden ${className ?? ""}`} /> : null}
      <img src={dark} alt={alt} className={`hidden dark:block ${className ?? ""}`} />
    </>
  );
}
