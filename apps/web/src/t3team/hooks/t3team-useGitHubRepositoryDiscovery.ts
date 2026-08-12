import { useCallback, useEffect, useMemo, useState } from "react";
import { useBackend } from "~/t3team/backend/t3team-index";
import { readIntegrationCache } from "./t3team-integrationCache";
import { useGitHubAuthProbe } from "./t3team-useGitHubAuthProbe";
import { useGitHubRepositoryDiscoveryFetchers } from "./t3team-useGitHubRepositoryDiscoveryFetchers";
import type {
  GitHubAuthAccount,
  GitHubAuthCache,
  GitHubDiscoveryCache,
} from "./t3team-githubRepositoryDiscoveryUtils";

export function useGitHubRepositoryDiscovery({
  enabled,
  projectKey,
  projectTitle,
  linkedRepositoryUrls,
}: {
  enabled: boolean;
  projectKey: string | undefined;
  projectTitle: string | undefined;
  linkedRepositoryUrls: ReadonlyArray<string>;
}) {
  const backend = useBackend();
  const authCache = readIntegrationCache<GitHubAuthCache>("github:auth")?.value;
  const discoveryCacheKey = useMemo(
    () => `github:discovery:${projectKey ?? "none"}:${projectTitle ?? "none"}`,
    [projectKey, projectTitle],
  );
  const discoveryCache = readIntegrationCache<GitHubDiscoveryCache>(discoveryCacheKey)?.value;
  const [githubHost, setGithubHost] = useState(
    discoveryCache?.githubHost ?? authCache?.githubHost ?? "",
  );
  const [githubAccount, setGithubAccount] = useState<string | undefined>(
    discoveryCache?.githubAccount ?? authCache?.githubAccount,
  );
  const [authStatus, setAuthStatus] = useState<
    "checking" | "authenticated" | "unauthenticated" | "unknown"
  >(authCache?.authStatus ?? "checking");
  const [authDetail, setAuthDetail] = useState<string | undefined>(authCache?.authDetail);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [loadingDiscovery, setLoadingDiscovery] = useState(false);
  const [suggestedUrls, setSuggestedUrls] = useState<ReadonlyArray<string>>(
    discoveryCache?.suggestedUrls ?? [],
  );
  const [discoveryWarning, setDiscoveryWarning] = useState<string | undefined>(
    discoveryCache?.discoveryWarning,
  );
  const [authenticatedHosts, setAuthenticatedHosts] = useState<ReadonlyArray<GitHubAuthAccount>>(
    authCache?.accounts ?? [],
  );

  useEffect(() => {
    const cachedAuth = readIntegrationCache<GitHubAuthCache>("github:auth")?.value;
    const cachedDiscovery = readIntegrationCache<GitHubDiscoveryCache>(discoveryCacheKey)?.value;

    setGithubHost(cachedDiscovery?.githubHost ?? cachedAuth?.githubHost ?? "");
    setGithubAccount(cachedDiscovery?.githubAccount ?? cachedAuth?.githubAccount);
    setAuthStatus(cachedAuth?.authStatus ?? "checking");
    setAuthDetail(cachedAuth?.authDetail);
    setAuthenticatedHosts(cachedAuth?.accounts ?? []);
    setSuggestedUrls(cachedDiscovery?.suggestedUrls ?? []);
    setDiscoveryWarning(cachedDiscovery?.discoveryWarning);
  }, [discoveryCacheKey]);

  const { discoverSuggestions, discoverSuggestionsAcrossHosts } =
    useGitHubRepositoryDiscoveryFetchers({
      backend,
      discoveryCacheKey,
      linkedRepositoryUrls,
      projectKey,
      projectTitle,
      setLoadingDiscovery,
      setDiscoveryWarning,
      setGithubHost,
      setGithubAccount,
      setSuggestedUrls,
    });

  useGitHubAuthProbe({
    enabled,
    refreshKey: discoveryCacheKey,
    onAuthenticated: discoverSuggestionsAcrossHosts,
    setAuthStatus,
    setAuthDetail,
    setLoadingAuth,
    setGithubHost,
    setGithubAccount,
    setAuthenticatedHosts,
  });

  const visibleSuggestedUrls = useMemo(
    () => suggestedUrls.filter((url) => !linkedRepositoryUrls.includes(url)),
    [linkedRepositoryUrls, suggestedUrls],
  );

  const selectHost = useCallback(
    (host: string) => {
      const matched = authenticatedHosts.find((entry) => entry.host === host);
      setGithubHost(host);
      setGithubAccount(matched?.account);
      void discoverSuggestions(host, matched?.account);
    },
    [authenticatedHosts, discoverSuggestions],
  );

  const refresh = useCallback(() => {
    if (authStatus === "authenticated" && authenticatedHosts.length > 0) {
      const active = authenticatedHosts.find((entry) => entry.active) ?? authenticatedHosts[0];
      if (!active) return;
      void discoverSuggestionsAcrossHosts({
        host: active.host,
        account: active.account,
        accounts: authenticatedHosts,
      });
      return;
    }
    void discoverSuggestions(githubHost, githubAccount);
  }, [
    authStatus,
    authenticatedHosts,
    discoverSuggestions,
    discoverSuggestionsAcrossHosts,
    githubAccount,
    githubHost,
  ]);

  return {
    backendAvailable: Boolean(backend),
    githubHost,
    githubAccount,
    authStatus,
    authDetail,
    loadingAuth,
    loadingDiscovery,
    suggestedUrls,
    visibleSuggestedUrls,
    discoveryWarning,
    authenticatedHosts,
    setGithubHost,
    selectHost,
    refresh,
  };
}

/** The hook's resolved shape, named here so the components that render it need not import
 * the section that happens to call it. */
export type GitHubDiscoveryState = ReturnType<typeof useGitHubRepositoryDiscovery>;
