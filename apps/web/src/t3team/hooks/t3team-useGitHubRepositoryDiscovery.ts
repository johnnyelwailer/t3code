import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveRefresh } from "~/hooks/useLiveRefresh";
import { useBackend } from "~/t3team/backend/t3team-index";
import { readIntegrationCache } from "./t3team-integrationCache";
import { useGitHubAuthProbe } from "./t3team-useGitHubAuthProbe";
import { useGitHubRepositoryDiscoveryFetchers } from "./t3team-useGitHubRepositoryDiscoveryFetchers";
import type { GitHubRepositoryCandidate } from "~/t3team/backend/t3team-githubBackendTypes";
import { useRepositoryListFollowUp } from "./t3team-useRepositoryListFollowUp";
import type {
  GitHubAuthAccount,
  RepositoriesMeta,
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
  const [repositoriesMeta, setRepositoriesMeta] = useState<RepositoriesMeta>({ refreshing: false });
  const [probeNonce, setProbeNonce] = useState(0);
  const [loadingDiscovery, setLoadingDiscovery] = useState(false);
  const [suggestedUrls, setSuggestedUrls] = useState<ReadonlyArray<string>>(
    discoveryCache?.suggestedUrls ?? [],
  );
  const [discoveryWarning, setDiscoveryWarning] = useState<string | undefined>(
    discoveryCache?.discoveryWarning,
  );
  const [catalog, setCatalog] = useState<ReadonlyArray<GitHubRepositoryCandidate>>([]);
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
      setCatalog,
      setRepositoriesMeta,
    });

  useGitHubAuthProbe({
    enabled,
    refreshKey: `${discoveryCacheKey}:${probeNonce}`,
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

  /** `force`: ask GitHub now. Otherwise the server answers from the list it keeps. */
  const reload = useCallback(
    async (force: boolean) => {
      if (authStatus === "authenticated" && authenticatedHosts.length > 0) {
        const active = authenticatedHosts.find((entry) => entry.active) ?? authenticatedHosts[0];
        if (!active) return;
        await discoverSuggestionsAcrossHosts({
          host: active.host,
          account: active.account,
          accounts: authenticatedHosts,
          ...(force ? { refresh: true } : {}),
        });
        return;
      }
      // Not signed in as far as the last probe knew: ask `gh` again, the sign-in may have happened since.
      if (force) setProbeNonce((nonce) => nonce + 1);
      await discoverSuggestions(githubHost, githubAccount, force);
    },
    [
      authStatus,
      authenticatedHosts,
      discoverSuggestions,
      discoverSuggestionsAcrossHosts,
      githubAccount,
      githubHost,
    ],
  );
  const refresh = useCallback(() => {
    void reload(true);
  }, [reload]);
  const reread = useCallback(() => reload(false), [reload]);
  useRepositoryListFollowUp({ refreshing: repositoriesMeta.refreshing, reread });

  // `gh auth status` reports "unauthenticated" when ANY host holds a refused token, even while
  // another (the Enterprise one) is signed in; a signed-in login is what the picker can use.
  const signedIn = authStatus === "authenticated" || authenticatedHosts.length > 0;
  const recheckAuth = useCallback(() => setProbeNonce((nonce) => nonce + 1), []);
  useLiveRefresh(recheckAuth, { enabled: enabled && !signedIn });

  return {
    backendAvailable: Boolean(backend),
    signedIn,
    repositoriesFetchedAt: repositoriesMeta.fetchedAt,
    repositoriesRefreshing: repositoriesMeta.refreshing,
    githubHost,
    githubAccount,
    authStatus,
    authDetail,
    loadingAuth,
    loadingDiscovery,
    suggestedUrls,
    visibleSuggestedUrls,
    catalog,
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
