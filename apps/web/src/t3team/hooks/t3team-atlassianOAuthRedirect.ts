export const ATLASSIAN_OAUTH_CALLBACK_PATH = "/oauth/callback";

/**
 * The default loopback origin of a pinned desktop backend (see
 * `DEFAULT_DESKTOP_BACKEND_PORT` in apps/desktop/src/app/DesktopBackendPort.ts).
 * Last-resort fallback when the desktop bridge is present but has not reported
 * its live base URL yet.
 */
const DESKTOP_DEFAULT_HTTP_BASE_URL = "http://127.0.0.1:3773";

function readDesktopPrimaryHttpBaseUrl(): string {
  const bootstraps = window.desktopBridge?.getLocalEnvironmentBootstraps?.() ?? [];
  const primary = bootstraps.find((entry) => entry.id === "desktopLocal");
  if (typeof primary?.httpBaseUrl === "string" && primary.httpBaseUrl.length > 0) {
    return primary.httpBaseUrl;
  }
  return "";
}

export function isAtlassianOAuthCallbackPath(pathname: string): boolean {
  return (
    pathname === ATLASSIAN_OAUTH_CALLBACK_PATH ||
    pathname.startsWith(`${ATLASSIAN_OAUTH_CALLBACK_PATH}/`)
  );
}

export function isHttpOrigin(origin: string): boolean {
  return origin.startsWith("http://") || origin.startsWith("https://");
}

function joinOAuthCallbackPath(baseUrl: string): string {
  return new URL(ATLASSIAN_OAUTH_CALLBACK_PATH, baseUrl).toString();
}

export function resolveAtlassianOAuthRedirectUri(input: {
  readonly locationOrigin: string;
  readonly configuredRedirectUri: string;
  readonly devServerUrl: string;
  /** True inside the Electron desktop shell (window.desktopBridge present). */
  readonly desktop?: boolean;
  readonly desktopHttpBaseUrl?: string;
}): string {
  const configured = input.configuredRedirectUri.trim();
  const desktopHttpBaseUrl = input.desktopHttpBaseUrl?.trim() ?? "";
  const liveDesktopRedirect = isHttpOrigin(desktopHttpBaseUrl)
    ? joinOAuthCallbackPath(desktopHttpBaseUrl)
    : "";

  if (input.desktop) {
    // The live backend origin is the source of truth in a desktop shell: a
    // baked __ATLASSIAN_OAUTH_REDIRECT_URI__ can point at a stale port (for
    // example a build-time env var from another machine), so it only applies
    // when the bridge has not reported a live base URL yet.
    if (liveDesktopRedirect) {
      return liveDesktopRedirect;
    }
    if (configured) {
      return configured;
    }
    const devServerUrl = input.devServerUrl.trim();
    if (devServerUrl) {
      return joinOAuthCallbackPath(devServerUrl);
    }
    return joinOAuthCallbackPath(DESKTOP_DEFAULT_HTTP_BASE_URL);
  }

  if (configured) {
    return configured;
  }

  if (isHttpOrigin(input.locationOrigin)) {
    return joinOAuthCallbackPath(input.locationOrigin);
  }

  const devServerUrl = input.devServerUrl.trim();
  if (devServerUrl) {
    return joinOAuthCallbackPath(devServerUrl);
  }

  throw new Error(
    "Atlassian OAuth redirect URI is not configured for this app shell. " +
      "Set VITE_ATLASSIAN_OAUTH_REDIRECT_URI (for example http://127.0.0.1:5733/oauth/callback) " +
      "and register the same URI in the Atlassian Developer Console.",
  );
}

export function readAtlassianOAuthRedirectUri(): string {
  return resolveAtlassianOAuthRedirectUri({
    locationOrigin: window.location.origin,
    configuredRedirectUri: __ATLASSIAN_OAUTH_REDIRECT_URI__,
    devServerUrl: import.meta.env.VITE_DEV_SERVER_URL ?? "",
    desktop: window.desktopBridge !== undefined,
    desktopHttpBaseUrl: readDesktopPrimaryHttpBaseUrl(),
  });
}
