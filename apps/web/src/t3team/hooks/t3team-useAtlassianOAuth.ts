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
import { runAtlassianOAuthAttempt } from "~/t3team/hooks/t3team-atlassianOAuthAttempt";
import { openOAuthPopup } from "~/t3team/hooks/t3team-atlassianOAuthPopup";
import { readAtlassianOAuthRedirectUri } from "~/t3team/hooks/t3team-atlassianOAuthRedirect";
import { beginAtlassianOAuthServerFlow } from "~/t3team/hooks/t3team-atlassianOAuthServerFlow";

export type OAuthState =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "waiting" }
  /**
   * Sign-in has to be opened by the user rather than by us. Two causes, one situation: the browser
   * refused the popup, or the user closed it before finishing. Neither is a failure — they simply
   * have not signed in yet — so this carries a live `signinUrl` and the attempt keeps waiting.
   */
  | { kind: "needs_manual_open"; signinUrl: string }
  | { kind: "exchanging" }
  | { kind: "listing_sites" }
  | { kind: "done"; token: TokenExchangeResult; sites: ReadonlyArray<AtlassianAccessibleResource> }
  /**
   * The server completed the flow itself, because sign-in finished somewhere this tab cannot see —
   * another browser, another profile, a phone. No token comes back here: the account is already
   * persisted, so the consumer's job is to reload the account list rather than to connect anything.
   */
  | { kind: "connected" }
  | { kind: "error"; message: string };

export type UseAtlassianOAuthResult = {
  state: OAuthState;
  startOAuth: (clientId?: string) => Promise<void>;
  reset: () => void;
};

/** Empty rather than throwing: a baseline we could not read must not abort a sign-in. */
async function listAccountIds(
  backend: ReturnType<typeof useBackend>,
): Promise<ReadonlyArray<string>> {
  if (!backend) return [];
  try {
    return (await backend.atlassian.listAccounts()).map((account) => account.id);
  } catch {
    return [];
  }
}

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

      const config: AtlassianOAuthConfig = { clientId: resolvedClientId, redirectUri };
      setState({ kind: "opening" });

      try {
        const pkce = await generatePkce();
        const tabState = randomUUID();
        const authUrl = buildAuthorizeUrl(config, pkce, tabState);

        const popup = openOAuthPopup(authUrl);
        // Read before anything can change it, so "a new account appeared" stays a usable signal even
        // when the user is reconnecting and accounts already exist.
        const baselineAccountIds = listAccountIds(backend);

        /*
          Started alongside the popup, not instead of it. If the user finishes in the popup the
          tab-owned flow wins and this one is left to expire; if they end up opening sign-in
          themselves, this is the link worth handing them — short, needing no prior session, and
          completable by the server from a browser that shares nothing with this tab.
        */
        const serverFlow = await beginAtlassianOAuthServerFlow({ redirectUri }).catch(() => null);
        const signinUrl = serverFlow?.shareUrl ?? authUrl;

        /*
          A blocked popup is not an error worth stopping for. Opening a window needs a user gesture
          the browser trusts, and plenty of setups withhold it — a strict blocker, an embedded
          webview, a click we arrived at indirectly. So keep waiting and hand the URL to the UI for
          the user to open themselves; the callback comes back over the broadcast channel either way.
        */
        setState(popup ? { kind: "waiting" } : { kind: "needs_manual_open", signinUrl });

        const outcome = await runAtlassianOAuthAttempt({
          popup,
          redirectUri,
          tabState,
          serverState: serverFlow?.state ?? null,
          listAccountIds: () => listAccountIds(backend),
          baselineAccountIds,
          onNeedsManualOpen: () => setState({ kind: "needs_manual_open", signinUrl }),
        });

        if (outcome.kind === "server_connected") {
          setState({ kind: "connected" });
          return;
        }
        if (!backend) {
          throw new Error("Backend not available");
        }

        setState({ kind: "exchanging" });
        const { token, sites } = await backend.atlassian.exchangeOAuthCode({
          code: outcome.code,
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
