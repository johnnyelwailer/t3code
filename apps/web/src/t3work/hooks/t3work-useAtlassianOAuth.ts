import { useCallback, useRef, useState } from "react";
import {
  generatePkce,
  buildAuthorizeUrl,
  type AtlassianAccessibleResource,
  type AtlassianOAuthConfig,
  type TokenExchangeResult,
} from "@t3tools/integrations-atlassian";
import { useBackend } from "~/t3work/backend/t3work-index";

const OAUTH_POPUP_WIDTH = 500;
const OAUTH_POPUP_HEIGHT = 600;
const POLL_INTERVAL_MS = 500;

export type OAuthState =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "waiting" }
  | { kind: "exchanging" }
  | { kind: "listing_sites" }
  | { kind: "done"; token: TokenExchangeResult; sites: ReadonlyArray<AtlassianAccessibleResource> }
  | { kind: "error"; message: string };

function openOAuthPopup(url: string): WindowProxy | null {
  const left = Math.round(window.screenX + (window.outerWidth - OAUTH_POPUP_WIDTH) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - OAUTH_POPUP_HEIGHT) / 2);
  return window.open(
    url,
    "atlassian-oauth",
    `width=${OAUTH_POPUP_WIDTH},height=${OAUTH_POPUP_HEIGHT},left=${left},top=${top},noopener,noreferrer`,
  );
}

function waitForCallback(
  popup: WindowProxy,
  redirectUri: string,
  timeoutMs = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let resolved = false;

    const cleanup = () => {
      resolved = true;
      if (!popup.closed) popup.close();
    };

    const timer = setInterval(() => {
      if (resolved) {
        clearInterval(timer);
        return;
      }

      if (popup.closed) {
        cleanup();
        reject(new Error("OAuth popup was closed before completing sign in."));
        return;
      }

      try {
        const href = popup.location.href;
        if (href && href.startsWith(redirectUri)) {
          cleanup();
          resolve(href);
        }
      } catch {
        // Cross-origin while on auth domain; ignore
      }

      if (Date.now() - start > timeoutMs) {
        cleanup();
        reject(new Error("OAuth sign in timed out. Please try again."));
      }
    }, POLL_INTERVAL_MS);
  });
}

export type UseAtlassianOAuthResult = {
  state: OAuthState;
  startOAuth: (clientId?: string) => Promise<void>;
  reset: () => void;
};

export function useAtlassianOAuth(): UseAtlassianOAuthResult {
  const backend = useBackend();
  const [state, setState] = useState<OAuthState>({ kind: "idle" });
  const abortRef = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setState({ kind: "idle" });
  }, []);

  const startOAuth = useCallback(
    async (clientId?: string) => {
      const resolvedClientId = clientId ?? __ATLASSIAN_CLIENT_ID__;
      if (!resolvedClientId) {
        setState({
          kind: "error",
          message:
            "Atlassian OAuth is not configured. Set VITE_ATLASSIAN_CLIENT_ID or provide a client ID.",
        });
        return;
      }

      const redirectUri = `${window.location.origin}/oauth/callback`;
      const config: AtlassianOAuthConfig = {
        clientId: resolvedClientId,
        redirectUri,
      };

      setState({ kind: "opening" });

      try {
        const pkce = await generatePkce();
        const stateParam = crypto.randomUUID();
        const authUrl = buildAuthorizeUrl(config, pkce, stateParam);

        setState({ kind: "waiting" });
        const popup = openOAuthPopup(authUrl);
        if (!popup) {
          throw new Error("Failed to open OAuth popup. Check your popup blocker settings.");
        }

        const callbackUrl = await waitForCallback(popup, redirectUri);
        const callback = new URL(callbackUrl);
        const code = callback.searchParams.get("code");
        const returnedState = callback.searchParams.get("state");
        const error = callback.searchParams.get("error");
        const errorDescription = callback.searchParams.get("error_description");

        if (error) {
          throw new Error(`OAuth error: ${error} ${errorDescription ?? ""}`.trim());
        }
        if (returnedState !== stateParam) {
          throw new Error("OAuth state mismatch. Possible CSRF attack.");
        }
        if (!code) {
          throw new Error("No authorization code in callback.");
        }
        if (!backend) {
          throw new Error("Backend not available");
        }

        setState({ kind: "exchanging" });
        const { token, sites } = await backend.atlassian.exchangeOAuthCode({
          code,
          codeVerifier: pkce.codeVerifier,
          redirectUri,
        });

        setState({ kind: "done", token, sites });
      } catch (error) {
        const message = error instanceof Error ? error.message : "OAuth failed";
        setState({ kind: "error", message });
      }
    },
    [backend],
  );

  return { state, startOAuth, reset };
}
