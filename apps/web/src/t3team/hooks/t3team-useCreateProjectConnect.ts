import { useCallback, useEffect, useState } from "react";

import type { IntegrationAccount } from "@t3tools/integrations-core";

import { useBackend } from "~/t3team/backend/t3team-index";
import { useAtlassianOAuth } from "~/t3team/hooks/t3team-useAtlassianOAuth";

import {
  defaultAtlassianSiteUrlInput,
  isValidAtlassianUrl,
  normalizeAtlassianUrl,
} from "./t3team-createProjectUtils";
import { writeIntegrationCache } from "./t3team-integrationCache";
import { ATLASSIAN_ACCOUNTS_CACHE_KEY } from "./t3team-jiraProjectCatalog.logic";

/**
 * Everything the "connect Jira" panel needs when no site is connected yet: the OAuth attempt, the
 * API-token fallback form, and the hand-off back to the catalog once a sign-in lands. Whatever the
 * route (this tab's popup, the system browser, a link opened elsewhere) the account is persisted
 * server-side, so the only thing left to do on success is to read the catalog again.
 */
export function useCreateProjectConnect(refreshCatalog: () => Promise<void>) {
  const backend = useBackend();
  const oauth = useAtlassianOAuth();
  const [siteUrl, setSiteUrl] = useState(defaultAtlassianSiteUrlInput);
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectWith = useCallback(
    async (connect: () => Promise<ReadonlyArray<IntegrationAccount>>) => {
      setError(null);
      setConnecting(true);
      try {
        writeIntegrationCache(ATLASSIAN_ACCOUNTS_CACHE_KEY, await connect());
        await refreshCatalog();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to connect Atlassian");
      } finally {
        setConnecting(false);
      }
    },
    [refreshCatalog],
  );

  useEffect(() => {
    if (oauth.state.kind !== "done") return;
    const { sites, token } = oauth.state;
    void connectWith(async () => {
      if (!backend) throw new Error("Backend not available");
      return backend.atlassian.connectOAuth({ sites, token });
    });
  }, [backend, connectWith, oauth.state]);

  useEffect(() => {
    if (oauth.state.kind === "connected") void refreshCatalog();
  }, [oauth.state.kind, refreshCatalog]);

  const connectBasic = useCallback(
    () =>
      connectWith(async () => {
        if (!backend) throw new Error("Backend not available");
        return backend.atlassian.connectBasic({
          siteUrl: normalizeAtlassianUrl(siteUrl),
          email,
          apiToken,
        });
      }),
    [apiToken, backend, connectWith, email, siteUrl],
  );

  return {
    oauth,
    oauthConfigured: Boolean(__ATLASSIAN_CLIENT_ID__),
    siteUrl,
    setSiteUrl,
    email,
    setEmail,
    apiToken,
    setApiToken,
    canConnectBasic: isValidAtlassianUrl(siteUrl),
    connecting,
    error: error ?? (oauth.state.kind === "error" ? oauth.state.message : null),
    connectBasic,
  };
}

export type CreateProjectConnect = ReturnType<typeof useCreateProjectConnect>;
