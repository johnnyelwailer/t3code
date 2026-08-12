import { useCallback, useEffect, useMemo, useState } from "react";
import { useBackend } from "~/t3team/backend/t3team-index";
import {
  normalizeCacheList,
  readIntegrationCache,
  writeIntegrationCache,
} from "./t3team-integrationCache";
import { useGitHubAuthProbe } from "./t3team-useGitHubAuthProbe";
import {
  mergeGitHubDiscoveryResults,
  type GitHubAuthAccount,
  type GitHubAuthCache,
  type GitHubDiscoveryResult,
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

  const discoverSuggestionsAcrossHosts = useCallback(
    async ({
      host,
      account,
      accounts,
    }: {
      readonly host: string;
      readonly account: string | undefined;
      readonly accounts: ReadonlyArray<GitHubAuthAccount>;
    }) => {
      const hosts = accounts.length > 0 ? accounts : [{ host, account, active: true }];
      if (!backend) return;

      setLoadingDiscovery(true);
      setDiscoveryWarning(undefined);
      try {
        const outcomes = await Promise.all(
          hosts.map(async (entry) => {
            try {
              const response = await backend.github.discoverInbox({
                host: entry.host,
                ...(projectKey ? { projectKey } : {}),
                ...(projectTitle ? { projectTitle } : {}),
                linkedRepositoryUrls,
              });
              return { response, error: undefined };
            } catch (error) {
              return {
                response: undefined,
                error: {
                  host: entry.host,
                  message: error instanceof Error ? error.message : "request failed",
                },
              };
            }
          }),
        );
        const responses: ReadonlyArray<GitHubDiscoveryResult> = outcomes.flatMap((outcome) =>
          outcome.response ? [outcome.response] : [],
        );
        const failures = outcomes.filter((outcome) => outcome.error);

        if (responses.length === 0) {
          setSuggestedUrls([]);
          setSelectedSuggestedUrls(new Set());
          setDiscoveryWarning(
            failures.length === 1
              ? `Could not search ${failures[0]?.error?.host ?? "GitHub"}.`
              : "Could not search the connected GitHub accounts.",
          );
          return;
        }

        const merged = mergeGitHubDiscoveryResults(responses, host);
        const failureWarning =
          failures.length > 0
            ? `Could not search ${failures.map((failure) => failure.error?.host).join(", ")}.`
            : undefined;
        const nextWarning = [merged.discoveryWarning, failureWarning]
          .filter((warning): warning is string => Boolean(warning))
          .join(" ");
        const nextAccount = merged.githubAccount ?? account;
        const nextCache: GitHubDiscoveryCache = {
          githubHost: merged.githubHost,
          ...(nextAccount ? { githubAccount: nextAccount } : {}),
          suggestedUrls: merged.suggestedUrls,
          ...(nextWarning ? { discoveryWarning: nextWarning } : {}),
        };

        writeIntegrationCache(discoveryCacheKey, nextCache);
        setGithubHost(merged.githubHost);
        setGithubAccount(nextAccount);
        setSuggestedUrls(merged.suggestedUrls);
        setSelectedSuggestedUrls(new Set(merged.suggestedUrls));
        setDiscoveryWarning(nextWarning || undefined);
      } finally {
        setLoadingDiscovery(false);
      }
    },
    [backend, discoveryCacheKey, linkedRepositoryUrls, projectKey, projectTitle],
  );

  useGitHubAuthProbe({
    enabled,
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
    visibleSuggestedUrls,
    selectedSuggestedUrls,
    discoveryWarning,
    authenticatedHosts,
    setGithubHost,
    selectHost,
    refresh,
    toggleSuggestion,
  };
}

/** The hook's resolved shape, named here so the components that render it need not import
 * the section that happens to call it. */
export type GitHubDiscoveryState = ReturnType<typeof useGitHubRepositoryDiscovery>;
