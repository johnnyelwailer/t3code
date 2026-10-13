import type { SourceControlDiscoveryResult } from "@t3tools/contracts";
import type { GitHubRepositoryCandidate } from "~/t3team/backend/t3team-githubBackendTypes";

export type GitHubAuthCache = {
  readonly githubHost: string;
  readonly githubAccount?: string;
  readonly authStatus: "authenticated" | "unauthenticated" | "unknown";
  readonly authDetail?: string;
  readonly accounts?: ReadonlyArray<GitHubAuthAccount>;
};

export type GitHubDiscoveryCache = {
  readonly githubHost: string;
  readonly githubAccount?: string;
  readonly suggestedUrls: ReadonlyArray<string>;
  readonly discoveryWarning?: string;
};

/** One authenticated `gh` host (e.g. `github.com` or a GitHub Enterprise host). */
export type GitHubAuthAccount = {
  readonly host: string;
  readonly account?: string;
  readonly active: boolean;
};

export type GitHubDiscoveryResult = {
  readonly host: string;
  readonly account?: string;
  readonly suggestedRepositoryUrls: ReadonlyArray<string>;
  readonly repositories?: ReadonlyArray<GitHubRepositoryCandidate>;
  readonly inboxWarning?: string;
  readonly repositoriesFetchedAt?: string;
  readonly repositoriesRefreshing?: true;
};

export type RepositoriesMeta = {
  /** The oldest fetch across the hosts shown, so "updated" never overstates. */
  readonly fetchedAt?: string;
  readonly refreshing: boolean;
};

export function mergeRepositoriesMeta(
  results: ReadonlyArray<GitHubDiscoveryResult>,
): RepositoriesMeta {
  const fetched = results
    .map((result) => result.repositoriesFetchedAt)
    .filter((value): value is string => value !== undefined)
    .toSorted();
  return {
    ...(fetched[0] ? { fetchedAt: fetched[0] } : {}),
    refreshing: results.some((result) => result.repositoriesRefreshing === true),
  };
}

export function mergeGitHubDiscoveryResults(
  results: ReadonlyArray<GitHubDiscoveryResult>,
  preferredHost?: string,
): {
  readonly githubHost: string;
  readonly githubAccount?: string;
  readonly suggestedUrls: ReadonlyArray<string>;
  readonly discoveryWarning?: string;
} {
  const preferred = results.find((result) => result.host === preferredHost) ?? results[0];
  const warnings = results
    .map((result) => result.inboxWarning)
    .filter((warning): warning is string => Boolean(warning));

  return {
    githubHost: preferred?.host ?? preferredHost ?? "github.com",
    ...(preferred?.account ? { githubAccount: preferred.account } : {}),
    suggestedUrls: [...new Set(results.flatMap((result) => result.suggestedRepositoryUrls))],
    ...(warnings.length > 0 ? { discoveryWarning: warnings.join(" ") } : {}),
  };
}

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

export function parseGitHubAuth(discovery: SourceControlDiscoveryResult): {
  status: "authenticated" | "unauthenticated" | "unknown";
  host?: string;
  account?: string;
  detail?: string;
  accounts: ReadonlyArray<GitHubAuthAccount>;
} {
  const github = discovery.sourceControlProviders.find((provider) => provider.kind === "github");
  if (!github) {
    return { status: "unknown", detail: "GitHub CLI provider was not found.", accounts: [] };
  }
  const host = parseOptionString(github.auth.host);
  const account = parseOptionString(github.auth.account);
  const detail = parseOptionString(github.auth.detail);
  // Only signed-in logins can be offered as a host choice; the provider also reports the ones
  // whose token was refused, which belong in Settings rather than in a repository picker.
  const accounts: ReadonlyArray<GitHubAuthAccount> = (github.auth.accounts ?? [])
    .filter((entry) => entry.authenticated)
    .map((entry) => {
      const entryAccount = parseOptionString(entry.account);
      return {
        host: entry.host,
        ...(entryAccount ? { account: entryAccount } : {}),
        active: entry.active,
      };
    });
  return {
    status: github.auth.status,
    ...(host ? { host } : {}),
    ...(account ? { account } : {}),
    ...(detail ? { detail } : {}),
    accounts,
  };
}
