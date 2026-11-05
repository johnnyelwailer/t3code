import { promptLinkDeepLink } from "@t3tools/shared/promptLinks";

/**
 * A distribution's custom URL scheme (e.g. `nexi`) opens a thread the same way `t3code://` does:
 * `<scheme>://threads/<environmentId>/<threadId>`. The host is `threads` (the collection) and the
 * path is `/<environmentId>/<threadId>` — the exact shape the web app and the renderer's
 * promptLinks parser already understand.
 *
 * Only a scheme the build declared (its distribution branding) is honored, and the path must be
 * exactly two non-empty segments. Anything else — a foreign scheme, a bare `nexi://`, a different
 * host, or a path with more or fewer segments — is rejected, so a deep link can never open an
 * arbitrary URL or path.
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
