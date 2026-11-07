import { promptLinkDeepLink } from "@t3tools/shared/promptLinks";

/**
 * A distribution scheme (e.g. `nexi`) opens a thread exactly like `t3code://`:
 * `<scheme>://threads/<environmentId>/<threadId>`. Only build-declared schemes and a
 * two-segment `/<environmentId>/<threadId>` path are honored; anything else is rejected.
 */

// Same shape as promptLinks' THREAD_PATH: two path segments, an optional trailing slash.
const THREAD_DEEP_LINK = /^\/([^/]+)\/([^/]+)\/?$/u;

/**
 * The app's in-app path (`/<env>/<thread>`) for a distribution-scheme thread deep link, or null
 * when the value is not one. `schemes` is the set the build registered (empty for the core app,
 * where this is always null).
 */
export function parseThreadDeepLink(value: string, schemes: readonly string[]): string | null {
  if (schemes.length === 0) return null;
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  const scheme = url.protocol.slice(0, -1); // "nexi:" -> "nexi"
  if (!schemes.includes(scheme)) return null;
  if (url.host !== "threads") return null;
  const match = THREAD_DEEP_LINK.exec(url.pathname);
  if (!match) return null;
  return `/${match[1]}/${match[2]}`;
}

/**
 * The t3code deep-link URL (`<desktopScheme>://threads/<env>/<thread>`) for a distribution-scheme
 * thread link, so the renderer's existing in-app navigation (promptLinkAppPath -> router.navigate)
 * handles it unchanged. null when the value is not a distribution-scheme thread link.
 */
export function threadDeepLinkToT3codeUrl(
  value: string,
  schemes: readonly string[],
  desktopScheme: string,
): string | null {
  const appPath = parseThreadDeepLink(value, schemes);
  return appPath === null ? null : promptLinkDeepLink(appPath, desktopScheme);
}
