import { useCallback, useEffect, useRef, useState } from "react";
import {
  generatePkce,
  buildAuthorizeUrl,
  type AtlassianAccessibleResource,
  type AtlassianOAuthConfig,
  type TokenExchangeResult,
} from "@t3tools/integrations-atlassian";
import { isElectron } from "~/env";
import { randomUUID } from "~/lib/utils";
import { useBackend } from "~/t3team/backend/t3team-index";
import type {
  OAuthState,
  UseAtlassianOAuthResult,
} from "~/t3team/hooks/t3team-atlassianOAuthTypes";
import { runAtlassianOAuthAttempt } from "~/t3team/hooks/t3team-atlassianOAuthAttempt";
import { openOAuthPopup } from "~/t3team/hooks/t3team-atlassianOAuthPopup";
import { readAtlassianOAuthRedirectUri } from "~/t3team/hooks/t3team-atlassianOAuthRedirect";
import {
  beginAtlassianOAuthServerFlow,
  getAtlassianOAuthFlowStatus,
} from "~/t3team/hooks/t3team-atlassianOAuthServerFlow";

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

  /**
   * Bumped by `reset` and on unmount, and captured by each `startOAuth` call at its own start. Every
   * state update from that attempt checks its captured id first, so a cancelled or superseded attempt
   * cannot clobber whatever came after it — one guard covering both "Cancel" and unmount without a
   * real abort signal threaded through three layers of in-flight `Promise`s.
   */
  const attemptIdRef = useRef(0);
  /** The server-owned flow's `state` this attempt is currently waiting on; read fresh every poll. */
  const serverStateRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      attemptIdRef.current += 1;
    },
    [],
  );

  const reset = useCallback(() => {
    attemptIdRef.current += 1;
    setState({ kind: "idle" });
  }, []);

  const mintFreshSigninLink = useCallback(async (): Promise<string> => {
    const redirectUri = readAtlassianOAuthRedirectUri();
    const serverFlow = await beginAtlassianOAuthServerFlow({ redirectUri });
    serverStateRef.current = serverFlow.state;
    setState({ kind: "needs_manual_open", signinUrl: serverFlow.shareUrl });
    return serverFlow.shareUrl;
  }, []);

  const startOAuth = useCallback(
    async (clientId?: string) => {
      const attemptId = ++attemptIdRef.current;
      const isCurrent = () => attemptIdRef.current === attemptId;
      const applyState = (next: OAuthState) => {
        if (isCurrent()) setState(next);
      };

      const resolvedClientId = clientId ?? __ATLASSIAN_CLIENT_ID__;
      if (!resolvedClientId) {
        applyState({
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
        applyState({ kind: "error", message });
        return;
      }

      const config: AtlassianOAuthConfig = { clientId: resolvedClientId, redirectUri };
      applyState({ kind: "opening" });

      try {
        const pkce = await generatePkce();
        const tabState = randomUUID();
        const authUrl = buildAuthorizeUrl(config, pkce, tabState);

        // window.open needs the click's user gesture, so on the web this runs before any awaited
        // work. Skipped on desktop: the embedded Electron window's isolated session has none of the
        // user's real browser cookies, so a popup there would force a fresh login every time.
        const popup = isElectron ? null : openOAuthPopup(authUrl);
        // Read before anything can change it, so a new account still counts as new on a reconnect.
        const baselineAccountIds = listAccountIds(backend);

        // Started alongside the popup: if the user finishes there this is left to expire, and if
        // they open sign-in themselves this is the link worth handing them — completable by the
        // server from a browser sharing nothing with this tab.
        const serverFlow = await beginAtlassianOAuthServerFlow({ redirectUri }).catch(() => null);
        serverStateRef.current = serverFlow?.state ?? null;

        let signinUrl: string;
        let externallyOpened = false;

        if (isElectron) {
          if (!serverFlow) {
            // authUrl is tab-owned: its PKCE verifier lives only in this renderer, so a callback
            // landing in the system browser could never hand it back. Opening it there would just
            // dead-end, so this is a real failure rather than a fallback link.
            applyState({
              kind: "error",
              message:
                "Couldn't reach the server to start Atlassian sign-in. Check your connection and try again.",
            });
            return;
          }
          // Not shareUrl: this renderer's origin is the t3code-dev://app custom protocol,
          // which neither shell.openExternal nor any external browser accepts. The
          // server-origin form (http://127.0.0.1:<port>/…) is what a browser here needs.
          signinUrl = serverFlow.serverOriginUrl;
          const openResult = window.desktopBridge?.openExternal?.(signinUrl);
          const opened = openResult ? await openResult.catch(() => false) : false;
          externallyOpened = opened;
          applyState(opened ? { kind: "waiting" } : { kind: "needs_manual_open", signinUrl });
        } else {
          signinUrl = serverFlow?.shareUrl ?? authUrl;
          // A blocked popup isn't an error worth stopping for; hand the URL to the UI to open.
          applyState(popup ? { kind: "waiting" } : { kind: "needs_manual_open", signinUrl });
        }

        const outcome = await runAtlassianOAuthAttempt({
          popup,
          redirectUri,
          tabState,
          getServerState: () => serverStateRef.current,
          getStatus: (flowState) => getAtlassianOAuthFlowStatus({ state: flowState }),
          listAccountIds: () => listAccountIds(backend),
          baselineAccountIds,
          isCancelled: () => !isCurrent(),
          externallyOpened,
          onNeedsManualOpen: () => applyState({ kind: "needs_manual_open", signinUrl }),
          onLinkExpired: () => {
            if (!isCurrent()) return;
            setState((current) =>
              current.kind === "needs_manual_open" ? { ...current, expired: true } : current,
            );
          },
        });

        if (outcome.kind === "server_connected") {
          applyState({ kind: "connected" });
          return;
        }
        if (!backend) {
          throw new Error("Backend not available");
        }

        applyState({ kind: "exchanging" });
        const { token, sites } = await backend.atlassian.exchangeOAuthCode({
          code: outcome.code,
          codeVerifier: pkce.codeVerifier,
          redirectUri,
        });

        applyState({ kind: "done", token, sites });
      } catch (error) {
        const message = error instanceof Error ? error.message : "OAuth failed";
        applyState({ kind: "error", message });
      }
    },
    [backend],
  );

  return { state, startOAuth, mintFreshSigninLink, reset };
}

export type { OAuthState, UseAtlassianOAuthResult };
