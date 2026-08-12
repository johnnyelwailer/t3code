import type { SourceControlDiscoveryResult } from "@t3tools/contracts";

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
  readonly inboxWarning?: string;
};

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
  const accounts: ReadonlyArray<GitHubAuthAccount> = (github.auth.accounts ?? []).map((entry) => {
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
