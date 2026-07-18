import type { EnvironmentAppearance } from "@t3tools/contracts";

export type T3workPackBrandAssets = NonNullable<EnvironmentAppearance["brand"]>;

export function pickT3workPackBrandAsset(
  brand: T3workPackBrandAssets | undefined,
  kind: "mark" | "wordmark",
  mode: "light" | "dark",
): string | undefined {
  if (!brand) return undefined;
  const darkVariant = kind === "mark" ? brand.markDark : brand.wordmarkDark;
  return (mode === "dark" ? darkVariant : undefined) ?? brand[kind];
}

const FAVICON_ID = "t3work-pack-favicon";
let replacedFavicons: { readonly element: HTMLLinkElement; readonly href: string }[] | undefined;

/** Swaps the document favicon to the pack brand mark; restores the original on undefined. */
export function applyT3workPackFavicon(markDataUrl: string | undefined): void {
  if (typeof document === "undefined") return;
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')].filter(
    (link) => link.id !== FAVICON_ID,
  );
  if (markDataUrl) {
    replacedFavicons ??= links.map((element) => ({ element, href: element.getAttribute("href") ?? "" }));
    for (const link of links) link.remove();
    let link = document.getElementById(FAVICON_ID) as HTMLLinkElement | null;
    link ??= Object.assign(document.createElement("link"), { id: FAVICON_ID, rel: "icon" });
    link.type = markDataUrl.slice("data:".length, markDataUrl.indexOf(";"));
    link.href = markDataUrl;
    if (!link.isConnected) document.head.append(link);
    return;
  }
  document.getElementById(FAVICON_ID)?.remove();
  for (const { element, href } of replacedFavicons ?? []) {
    element.setAttribute("href", href);
    if (!element.isConnected) document.head.append(element);
  }
  replacedFavicons = undefined;
}
