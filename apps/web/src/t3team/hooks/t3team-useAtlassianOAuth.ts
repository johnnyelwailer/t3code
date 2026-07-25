import { useCallback, useRef, useState } from "react";
import {
  generatePkce,
  buildAuthorizeUrl,
  type AtlassianAccessibleResource,
  type AtlassianOAuthConfig,
  type TokenExchangeResult,
} from "@t3tools/integrations-atlassian";
import { randomUUID } from "~/lib/utils";
import { useBackend } from "~/t3team/backend/t3team-index";
import { openOAuthPopup, waitForOAuthCallback } from "~/t3team/hooks/t3team-atlassianOAuthPopup";
import { readAtlassianOAuthRedirectUri } from "~/t3team/hooks/t3team-atlassianOAuthRedirect";

export type OAuthState =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "waiting" }
  /**
   * The popup was blocked, so the sign-in window has to be opened by the user. `authorizeUrl` is
   * live and still being waited on — this is a prompt, not a failure.
   */
  | { kind: "popup_blocked"; authorizeUrl: string }
  | { kind: "exchanging" }
  | { kind: "listing_sites" }
  | { kind: "done"; token: TokenExchangeResult; sites: ReadonlyArray<AtlassianAccessibleResource> }
  | { kind: "error"; message: string };

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

      let redirectUri: string;
      try {
        redirectUri = readAtlassianOAuthRedirectUri();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "OAuth redirect URI is not configured.";
        setState({ kind: "error", message });
        return;
      }

      const config: AtlassianOAuthConfig = {
        clientId: resolvedClientId,
        redirectUri,
      };

      setState({ kind: "opening" });

      try {
        const pkce = await generatePkce();
        const stateParam = randomUUID();
        const authUrl = buildAuthorizeUrl(config, pkce, stateParam);

        const popup = openOAuthPopup(authUrl);

        /*
          A blocked popup is not an error worth stopping for. Opening a window needs a user gesture
          the browser trusts, and plenty of setups withhold it — a strict blocker, an embedded
          webview, a click we arrived at indirectly. So keep waiting and hand the URL to the UI for
          the user to open themselves; the callback comes back over the broadcast channel either way.
        */
        setState(popup ? { kind: "waiting" } : { kind: "popup_blocked", authorizeUrl: authUrl });

        const callbackUrl = await waitForOAuthCallback(popup, redirectUri);
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
