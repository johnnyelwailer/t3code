import { isLoopbackTunnelUrl } from "./t3team-nexiLoopbackFetch";

let allowRequest: ((url: string) => boolean) | null = null;

/** Installed by the broker module once it exists; absent in builds without the Nexi broker. */
export function installNativeFetchAuthorization(allow: ((url: string) => boolean) | null) {
  allowRequest = allow;
}

/**
 * Native HTTP clients cannot send the loopback cookie. Before one is handed a URL for a live broker
 * tunnel, the tunnel's owner is told that exact URL, and admits only that request. The credential
 * itself never reaches JS. Returns whether the native side accepted the URL.
 */
export function authorizeNativeFetch(url: string): boolean {
  try {
    if (allowRequest === null || !isLoopbackTunnelUrl(new URL(url))) return false;
    return allowRequest(url);
  } catch {
    return false;
  }
}

/**
 * A URL of a live broker tunnel only works inside this app, and the signed asset URLs among them
 * are capabilities. They are never handed to another app: not opened with an intent, not shared.
 */
export function isTunnelUrl(url: string): boolean {
  try {
    return isLoopbackTunnelUrl(new URL(url));
  } catch {
    return false;
  }
}

/** Shares `url` through `share` unless it is a tunnel URL; returns whether it was shared. */
export function shareUnlessPrivate(url: string, share: (message: string) => unknown): boolean {
  if (isTunnelUrl(url)) return false;
  void share(url);
  return true;
}
