import { useEffect, useState, type CSSProperties } from "react";

import { isElectron } from "~/env";
import { isMacPlatform } from "~/lib/utils";

/**
 * Same value as upstream's `MACOS_TRAFFIC_LIGHTS_LEFT_INSET` in
 * `~/components/AppSidebarLayout.tsx` — duplicated because that file is
 * upstream-owned (the additive guard keeps it pristine). If upstream moves
 * the traffic lights, both change together.
 */
const MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "90px";

/**
 * macOS-desktop titlebar inset for a `SidebarProvider` the T3 Team shell owns.
 *
 * Upstream's `AppSidebarLayout` pins `--workspace-controls-left` to the
 * traffic-light inset on ITS provider — the sidebar header's brand margin
 * (`--workspace-titlebar-content-left`) is derived from that variable, so a
 * provider without it renders the brand underneath the native window buttons.
 * The Team shell mounts its own provider and therefore needs the same
 * treatment, including dropping the inset while the window is fullscreen
 * (the traffic lights auto-hide there).
 */
export function useT3TeamMacosTitlebarInsetStyle(): CSSProperties {
  const isMacosDesktop = isElectron && isMacPlatform(navigator.platform);
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(() => {
    const getWindowFullscreenState = window.desktopBridge?.getWindowFullscreenState;
    return isMacosDesktop && typeof getWindowFullscreenState === "function"
      ? getWindowFullscreenState()
      : false;
  });

  useEffect(() => {
    if (!isMacosDesktop) return;
    const bridge = window.desktopBridge;
    if (!bridge) return;
    const { getWindowFullscreenState, onWindowFullscreenStateChange } = bridge;
    if (
      typeof getWindowFullscreenState !== "function" ||
      typeof onWindowFullscreenStateChange !== "function"
    ) {
      return;
    }

    const unsubscribe = onWindowFullscreenStateChange(setIsWindowFullscreen);
    setIsWindowFullscreen(getWindowFullscreenState());
    return unsubscribe;
  }, [isMacosDesktop]);

  return isMacosDesktop && !isWindowFullscreen
    ? ({ "--workspace-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET } as CSSProperties)
    : {};
}
