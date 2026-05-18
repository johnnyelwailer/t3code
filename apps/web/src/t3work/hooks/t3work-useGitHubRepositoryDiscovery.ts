import { useCallback, useEffect, useMemo, useState } from "react";
import type { SourceControlDiscoveryResult } from "@t3tools/contracts";
import { readLocalApi } from "~/localApi";
import { useBackend } from "~/t3work/backend/t3work-index";

function parseOptionString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (!value || typeof value !== "object") return undefined;
  const tagged = value as { _tag?: unknown; value?: unknown };
  if (
    tagged._tag === "Some" &&
    typeof tagged.value === "string" &&
    tagged.value.trim().length > 0
  ) {
    return tagged.value.trim();
  }
  return undefined;
}

function parseGitHubAuth(discovery: SourceControlDiscoveryResult): {
  status: "authenticated" | "unauthenticated" | "unknown";
  host?: string;
  account?: string;
  detail?: string;
} {
  const github = discovery.sourceControlProviders.find((provider) => provider.kind === "github");
  if (!github) {
    return { status: "unknown", detail: "GitHub CLI provider was not found." };
  }
  const host = parseOptionString(github.auth.host);
  const account = parseOptionString(github.auth.account);
  const detail = parseOptionString(github.auth.detail);
  return {
    status: github.auth.status,
    ...(host ? { host } : {}),
    ...(account ? { account } : {}),
    ...(detail ? { detail } : {}),
  };
}

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
  const [githubHost, setGithubHost] = useState("");
  const [githubAccount, setGithubAccount] = useState<string | undefined>(undefined);
  const [authStatus, setAuthStatus] = useState<
    "checking" | "authenticated" | "unauthenticated" | "unknown"
  >("checking");
  const [authDetail, setAuthDetail] = useState<string | undefined>(undefined);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [loadingDiscovery, setLoadingDiscovery] = useState(false);
  const [suggestedUrls, setSuggestedUrls] = useState<ReadonlyArray<string>>([]);
  const [selectedSuggestedUrls, setSelectedSuggestedUrls] = useState<Set<string>>(new Set());
  const [discoveryWarning, setDiscoveryWarning] = useState<string | undefined>(undefined);

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
    [backend, linkedRepositoryUrls, projectKey, projectTitle],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = async () => {
      setLoadingAuth(true);
      try {
        const api = readLocalApi();
        if (!api) {
          if (!cancelled) {
            setAuthStatus("unknown");
            setAuthDetail("Local API is unavailable.");
          }
          return;
        }
        const discovery = await api.server.discoverSourceControl();
        if (cancelled) return;
        const auth = parseGitHubAuth(discovery);
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
  }, [discoverSuggestions, enabled]);

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
