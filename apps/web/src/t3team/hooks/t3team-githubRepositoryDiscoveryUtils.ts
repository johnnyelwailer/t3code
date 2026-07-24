import type { SourceControlDiscoveryResult } from "@t3tools/contracts";

export type GitHubAuthCache = {
  readonly githubHost: string;
  readonly githubAccount?: string;
  readonly authStatus: "authenticated" | "unauthenticated" | "unknown";
  readonly authDetail?: string;
};

export type GitHubDiscoveryCache = {
  readonly githubHost: string;
  readonly githubAccount?: string;
  readonly suggestedUrls: ReadonlyArray<string>;
  readonly discoveryWarning?: string;
};

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
