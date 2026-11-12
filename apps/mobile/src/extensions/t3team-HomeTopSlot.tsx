import { ExtensionBoundary } from "./t3team-ExtensionBoundary";
import { mobileExtensions } from "./t3team-extensions";
import type { HomeCatalogState } from "./t3team-extensionTypes";

/** The distribution's `homeTop` slot, isolated from the stock home; nothing without one. */
export function HomeTopSlot(props: { readonly catalog: HomeCatalogState }) {
  const HomeTop = mobileExtensions.homeTop;
  return HomeTop ? (
    <ExtensionBoundary>
      <HomeTop catalog={props.catalog} />
    </ExtensionBoundary>
  ) : null;
}
