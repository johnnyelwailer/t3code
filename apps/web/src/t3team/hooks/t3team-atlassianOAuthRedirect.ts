export const ATLASSIAN_OAUTH_CALLBACK_PATH = "/oauth/callback";

function readDesktopPrimaryHttpBaseUrl(): string {
  const bootstraps = window.desktopBridge?.getLocalEnvironmentBootstraps?.() ?? [];
  const primary = bootstraps.find((entry) => entry.id === "desktopLocal");
  if (typeof primary?.httpBaseUrl === "string" && primary.httpBaseUrl.length > 0) {
    return primary.httpBaseUrl;
  }
  if (window.desktopBridge !== undefined) {
    return "http://127.0.0.1:3773";
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
  readonly desktopHttpBaseUrl?: string;
}): string {
  const configured = input.configuredRedirectUri.trim();
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

  const desktopHttpBaseUrl = input.desktopHttpBaseUrl?.trim() ?? "";
  if (isHttpOrigin(desktopHttpBaseUrl)) {
    return joinOAuthCallbackPath(desktopHttpBaseUrl);
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
    desktopHttpBaseUrl: readDesktopPrimaryHttpBaseUrl(),
  });
}
