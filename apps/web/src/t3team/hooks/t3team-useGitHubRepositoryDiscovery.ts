import { useCallback, useEffect, useMemo, useState } from "react";
import { useBackend } from "~/t3team/backend/t3team-index";
import {
  normalizeCacheList,
  readIntegrationCache,
  writeIntegrationCache,
} from "./t3team-integrationCache";
import { useGitHubAuthProbe } from "./t3team-useGitHubAuthProbe";
import {
  type GitHubAuthAccount,
  type GitHubAuthCache,
  type GitHubDiscoveryCache,
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
    () =>
      `github:discovery:${projectKey ?? "none"}:${projectTitle ?? "none"}:${normalizeCacheList(linkedRepositoryUrls)}`,
    [linkedRepositoryUrls, projectKey, projectTitle],
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
  const [selectedSuggestedUrls, setSelectedSuggestedUrls] = useState<Set<string>>(
    new Set(discoveryCache?.suggestedUrls ?? []),
  );
  const [discoveryWarning, setDiscoveryWarning] = useState<string | undefined>(
    discoveryCache?.discoveryWarning,
  );
  const [authenticatedHosts, setAuthenticatedHosts] = useState<ReadonlyArray<GitHubAuthAccount>>(
    [],
  );

  useEffect(() => {
    const cachedAuth = readIntegrationCache<GitHubAuthCache>("github:auth")?.value;
    const cachedDiscovery = readIntegrationCache<GitHubDiscoveryCache>(discoveryCacheKey)?.value;

    setGithubHost(cachedDiscovery?.githubHost ?? cachedAuth?.githubHost ?? "");
    setGithubAccount(cachedDiscovery?.githubAccount ?? cachedAuth?.githubAccount);
    setAuthStatus(cachedAuth?.authStatus ?? "checking");
    setAuthDetail(cachedAuth?.authDetail);
    setSuggestedUrls(cachedDiscovery?.suggestedUrls ?? []);
    setSelectedSuggestedUrls(new Set(cachedDiscovery?.suggestedUrls ?? []));
    setDiscoveryWarning(cachedDiscovery?.discoveryWarning);
  }, [discoveryCacheKey]);

  const discoverSuggestions = useCallback(
    async (host: string, account?: string) => {
      if (!backend || !host) return;
      setLoadingDiscovery(true);
      setDiscoveryWarning(undefined);
      try {
        const response = await backend.github.discoverInbox({
          host,
          ...(projectKey ? { projectKey } : {}),
          ...(projectTitle ? { projectTitle } : {}),
          linkedRepositoryUrls,
        });
        const nextAccount = response.account ?? account;
        const nextCache: GitHubDiscoveryCache = {
          githubHost: response.host,
          ...(nextAccount !== undefined ? { githubAccount: nextAccount } : {}),
          suggestedUrls: response.suggestedRepositoryUrls,
          ...(response.inboxWarning ? { discoveryWarning: response.inboxWarning } : {}),
        };
        writeIntegrationCache(discoveryCacheKey, nextCache);
        setGithubHost(response.host);
        setGithubAccount(response.account ?? account);
        setSuggestedUrls(response.suggestedRepositoryUrls);
        setSelectedSuggestedUrls(new Set(response.suggestedRepositoryUrls));
        setDiscoveryWarning(response.inboxWarning);
      } catch (error) {
        setSuggestedUrls([]);
        setSelectedSuggestedUrls(new Set());
        setDiscoveryWarning(
          error instanceof Error ? error.message : "Failed to discover repository suggestions.",
        );
      } finally {
        setLoadingDiscovery(false);
      }
    },
    [backend, discoveryCacheKey, linkedRepositoryUrls, projectKey, projectTitle],
  );

  useGitHubAuthProbe({
    enabled,
    onAuthenticated: discoverSuggestions,
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

  useEffect(() => {
    setSelectedSuggestedUrls((current) => {
      const next = new Set(visibleSuggestedUrls.filter((url) => current.has(url)));
      if (next.size === 0) {
        for (const url of visibleSuggestedUrls) next.add(url);
      }
      return next;
    });
  }, [visibleSuggestedUrls]);

  const toggleSuggestion = useCallback((url: string) => {
    setSelectedSuggestedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const selectHost = useCallback(
    (host: string) => {
      const matched = authenticatedHosts.find((entry) => entry.host === host);
      setGithubHost(host);
      setGithubAccount(matched?.account);
      void discoverSuggestions(host, matched?.account);
    },
    [authenticatedHosts, discoverSuggestions],
  );

  return {
    backendAvailable: Boolean(backend),
    githubHost,
    githubAccount,
    authStatus,
    authDetail,
    loadingAuth,
    loadingDiscovery,
    visibleSuggestedUrls,
    selectedSuggestedUrls,
    discoveryWarning,
    authenticatedHosts,
    setGithubHost,
    selectHost,
    refresh: () => discoverSuggestions(githubHost, githubAccount),
    toggleSuggestion,
  };
}
