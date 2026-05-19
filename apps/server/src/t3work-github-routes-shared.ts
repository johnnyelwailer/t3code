import { normalizeRepositoryUrls } from "./t3work-project-repository-utils.ts";

export type GitHubInboxDiscoverRequest = {
  readonly host: string;
  readonly projectKey?: string;
  readonly projectTitle?: string;
  readonly linkedRepositoryUrls?: ReadonlyArray<string>;
};

export type GitHubRepositoryCandidate = {
  readonly id: string;
  readonly nameWithOwner: string;
  readonly url: string;
  readonly host: string;
  readonly updatedAt?: string;
  readonly description?: string;
  readonly isPrivate?: boolean;
};

export type GitHubInboxItem = {
  readonly id: string;
  readonly repository: string;
  readonly repositoryUrl?: string;
  readonly reason: string;
  readonly authorLogin?: string;
  readonly authorAvatarUrl?: string;
  readonly reviewRequested?: boolean;
  readonly subjectType?: string;
  readonly subjectTitle?: string;
  readonly subjectUrl?: string;
  readonly subjectBranch?: string;
  readonly subjectState?: "open" | "closed" | "merged" | "draft";
  readonly commentCount?: number;
  readonly reviewCommentCount?: number;
  readonly additions?: number;
  readonly deletions?: number;
  readonly changedFiles?: number;
  readonly updatedAt?: string;
};

export type GitHubInboxDiscoverResponse = {
  readonly host: string;
  readonly account?: string;
  readonly repositories: ReadonlyArray<GitHubRepositoryCandidate>;
  readonly inboxItems: ReadonlyArray<GitHubInboxItem>;
  readonly suggestedRepositoryUrls: ReadonlyArray<string>;
  readonly inboxWarning?: string;
};

export type RawGitHubRepo = {
  readonly id?: number;
  readonly full_name?: string;
  readonly html_url?: string;
  readonly updated_at?: string;
  readonly description?: string | null;
  readonly private?: boolean;
};

export type RawGitHubNotification = {
  readonly id?: string;
  readonly reason?: string;
  readonly updated_at?: string;
  readonly repository?: { readonly full_name?: string };
  readonly subject?: { readonly type?: string; readonly title?: string; readonly url?: string };
};

export type RawGitHubPullRequest = {
  readonly id?: number;
  readonly number?: number;
  readonly title?: string;
  readonly updated_at?: string;
  readonly state?: string;
  readonly merged_at?: string | null;
  readonly draft?: boolean;
  readonly html_url?: string;
  readonly user?: { readonly login?: string; readonly avatar_url?: string };
  readonly requested_reviewers?: ReadonlyArray<{ readonly login?: string }>;
  readonly head?: { readonly ref?: string };
  readonly comments?: number;
  readonly review_comments?: number;
  readonly additions?: number;
  readonly deletions?: number;
  readonly changed_files?: number;
};

export type GitHubRepositoriesAttempt = {
  readonly items: ReadonlyArray<GitHubRepositoryCandidate>;
  readonly warning?: string;
};

export type GitHubInboxAttempt = {
  readonly items: ReadonlyArray<GitHubInboxItem>;
  readonly warning?: string;
};

type CacheEntry<T> = { readonly value: T; readonly expiresAt: number };

export const ACCOUNT_CACHE_TTL_MS = 5 * 60_000;
export const UNAUTHENTICATED_ACCOUNT_CACHE_TTL_MS = 20_000;
export const REPOSITORIES_CACHE_TTL_MS = 2 * 60_000;
export const INBOX_CACHE_TTL_MS = 45_000;
export const RESPONSE_CACHE_TTL_MS = 20_000;
const CACHE_MAX_ENTRIES = 256;

export const accountCache = new Map<string, CacheEntry<string | undefined>>();
export const repositoriesCache = new Map<string, CacheEntry<GitHubRepositoriesAttempt>>();
export const inboxCache = new Map<string, CacheEntry<GitHubInboxAttempt>>();
export const responseCache = new Map<string, CacheEntry<GitHubInboxDiscoverResponse>>();
export const pullRequestStateCache = new Map<
  string,
  CacheEntry<
    Pick<
      GitHubInboxItem,
      | "subjectState"
      | "subjectUrl"
      | "subjectBranch"
      | "authorLogin"
      | "authorAvatarUrl"
      | "reviewRequested"
      | "commentCount"
      | "reviewCommentCount"
      | "additions"
      | "deletions"
      | "changedFiles"
    >
  >
>();

export function readCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function writeCached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
): void {
  if (cache.size >= CACHE_MAX_ENTRIES && !cache.has(key)) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === "string") cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function parseJsonArray<T>(raw: string, fallback: ReadonlyArray<T>): ReadonlyArray<T> {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReadonlyArray<T>) : fallback;
  } catch {
    return fallback;
  }
}

export function makeResponseCacheKey(input: {
  readonly host: string;
  readonly projectKey?: string;
  readonly projectTitle?: string;
  readonly linkedRepositoryUrls?: ReadonlyArray<string>;
}): string {
  const linked = normalizeRepositoryUrls(input.linkedRepositoryUrls).join("|");
  return [
    "v3",
    input.host,
    readTrimmedString(input.projectKey)?.toLowerCase() ?? "",
    readTrimmedString(input.projectTitle)?.toLowerCase() ?? "",
    linked,
  ].join("::");
}

export const EMPTY_RESPONSE: Omit<GitHubInboxDiscoverResponse, "host"> = {
  repositories: [],
  inboxItems: [],
  suggestedRepositoryUrls: [],
};
