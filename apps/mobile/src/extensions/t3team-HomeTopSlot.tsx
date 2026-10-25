import { ExtensionBoundary } from "./t3team-ExtensionBoundary";
import { mobileExtensions } from "./t3team-extensions";

/** The distribution's `homeTop` slot, isolated from the stock home; nothing without one. */
export function HomeTopSlot() {
  const HomeTop = mobileExtensions.homeTop;
  return HomeTop ? (
    <ExtensionBoundary>
      <HomeTop />
    </ExtensionBoundary>
  ) : null;
}
