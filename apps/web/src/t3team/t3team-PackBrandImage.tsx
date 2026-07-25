import type { T3TeamPackBrandAssets } from "./t3team-packBrand";
import { pickT3TeamPackBrandAsset } from "./t3team-packBrand";

/**
 * Renders a pack brand mark or wordmark, switching to the dark variant via CSS
 * so it stays in sync with the root `.dark` class without re-rendering.
 */
export function T3TeamPackBrandImage({
  brand,
  kind,
  className,
  alt = "",
}: {
  brand: T3TeamPackBrandAssets | undefined;
  kind: "mark" | "wordmark";
  className?: string;
  alt?: string;
}) {
  const light = pickT3TeamPackBrandAsset(brand, kind, "light");
  const dark = pickT3TeamPackBrandAsset(brand, kind, "dark");
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
