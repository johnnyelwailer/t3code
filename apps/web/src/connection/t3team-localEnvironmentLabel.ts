import { isLoopbackHost } from "@t3tools/shared/preview";

/** What the user's own machine is called in pickers and settings, instead of its hostname. */
export const LOCAL_ENVIRONMENT_LABEL = "This computer";

/**
 * The primary environment's display label. It is "This computer" when the primary really is the
 * machine in front of the user — the desktop app's own backend, or a web client served from
 * loopback — and otherwise its own label: a primary reached over the network is somebody's server,
 * and calling it "this computer" would be wrong.
 */
export function primaryEnvironmentLabel(label: string): string {
  if (typeof window === "undefined") return label;
  return window.desktopBridge !== undefined || isLoopbackHost(window.location.hostname)
    ? LOCAL_ENVIRONMENT_LABEL
    : label;
}
