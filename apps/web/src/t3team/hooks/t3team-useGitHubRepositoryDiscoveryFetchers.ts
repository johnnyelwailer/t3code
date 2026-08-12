import { useCallback } from "react";
import type { useBackend } from "~/t3team/backend/t3team-index";
import { writeIntegrationCache } from "./t3team-integrationCache";
import {
  mergeGitHubDiscoveryResults,
  type GitHubAuthAccount,
  type GitHubDiscoveryResult,
  type GitHubDiscoveryCache,
} from "./t3team-githubRepositoryDiscoveryUtils";

// Extracted from t3team-useGitHubRepositoryDiscovery.ts: the two network-fetching callbacks
// (single-host and multi-host discovery) were the bulk of that hook's line count. They share
// nothing behavioral with the state-shaping the rest of the hook does, so they move here as
// their own sub-hook, taking the state setters they need to update as parameters.
export function useGitHubRepositoryDiscoveryFetchers({
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
  setSelectedSuggestedUrls,
}: {
  backend: ReturnType<typeof useBackend>;
  discoveryCacheKey: string;
  linkedRepositoryUrls: ReadonlyArray<string>;
  projectKey: string | undefined;
  projectTitle: string | undefined;
  setLoadingDiscovery: (loading: boolean) => void;
  setDiscoveryWarning: (warning: string | undefined) => void;
  setGithubHost: (host: string) => void;
  setGithubAccount: (account: string | undefined) => void;
  setSuggestedUrls: (urls: ReadonlyArray<string>) => void;
  setSelectedSuggestedUrls: (urls: Set<string>) => void;
}) {
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
    [
      backend,
      discoveryCacheKey,
      linkedRepositoryUrls,
      projectKey,
      projectTitle,
      setDiscoveryWarning,
      setGithubAccount,
      setGithubHost,
      setLoadingDiscovery,
      setSelectedSuggestedUrls,
      setSuggestedUrls,
    ],
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
                discoveryMode: "repositories",
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
    [
      backend,
      discoveryCacheKey,
      linkedRepositoryUrls,
      projectKey,
      projectTitle,
      setDiscoveryWarning,
      setGithubAccount,
      setGithubHost,
      setLoadingDiscovery,
      setSelectedSuggestedUrls,
      setSuggestedUrls,
    ],
  );

  return { discoverSuggestions, discoverSuggestionsAcrossHosts };
}
