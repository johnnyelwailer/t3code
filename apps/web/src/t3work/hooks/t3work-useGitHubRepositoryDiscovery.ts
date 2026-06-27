import { useCallback, useEffect, useMemo, useState } from "react";
import { AsyncResult } from "effect/unstable/reactivity";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { useBackend } from "~/t3work/backend/t3work-index";
import {
  normalizeCacheList,
  readIntegrationCache,
  writeIntegrationCache,
} from "./t3work-integrationCache";
import {
  parseGitHubAuth,
  type GitHubAuthCache,
  type GitHubDiscoveryCache,
} from "./t3work-githubRepositoryDiscoveryUtils";

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
  const environmentId = usePrimaryEnvironmentId();
  const discoverSourceControl = useAtomQueryRunner(sourceControlEnvironment.discovery, {
    reportFailure: false,
  });
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

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = async () => {
      setLoadingAuth(true);
      try {
        if (environmentId === null) {
          if (!cancelled) {
            setAuthStatus("unknown");
            setAuthDetail("Server environment is unavailable.");
          }
          return;
        }
        const discoveryResult = await discoverSourceControl({
          environmentId,
          input: {},
        });
        if (AsyncResult.isFailure(discoveryResult)) {
          if (!cancelled) {
            setAuthStatus("unknown");
            setAuthDetail("Failed to inspect GitHub auth.");
          }
          return;
        }
        const discovery = discoveryResult.value;
        if (cancelled) return;
        const auth = parseGitHubAuth(discovery);
        writeIntegrationCache("github:auth", {
          githubHost: auth.host ?? "github.com",
          ...(auth.account ? { githubAccount: auth.account } : {}),
          authStatus: auth.status,
          ...(auth.detail ? { authDetail: auth.detail } : {}),
        });
        setAuthStatus(auth.status);
        setAuthDetail(auth.detail);
        setGithubHost(auth.host ?? "github.com");
        setGithubAccount(auth.account);
        if (auth.status === "authenticated") {
          await discoverSuggestions(auth.host ?? "github.com", auth.account);
        }
      } catch (error) {
        if (!cancelled) {
          setAuthStatus("unknown");
          setAuthDetail(error instanceof Error ? error.message : "Failed to inspect GitHub auth.");
        }
      } finally {
        if (!cancelled) setLoadingAuth(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [discoverSourceControl, discoverSuggestions, enabled, environmentId]);

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
    setGithubHost,
    refresh: () => discoverSuggestions(githubHost, githubAccount),
    toggleSuggestion,
  };
}
