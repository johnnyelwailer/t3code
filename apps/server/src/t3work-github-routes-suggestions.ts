import { normalizeRepositoryUrls } from "./t3work-project-repository-utils.ts";
import type { GitHubInboxItem, GitHubRepositoryCandidate } from "./t3work-github-routes-shared.ts";
import { readTrimmedString } from "./t3work-github-routes-shared.ts";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function collectProjectTokens(input: {
  readonly projectKey?: string;
  readonly projectTitle?: string;
}): ReadonlyArray<string> {
  const tokens = new Set<string>();
  const normalizedKey = readTrimmedString(input.projectKey)?.toLowerCase();
  if (normalizedKey) tokens.add(normalizedKey);

  const title = readTrimmedString(input.projectTitle)?.toLowerCase();
  if (title) {
    for (const piece of title.split(/[^a-z0-9]+/g)) {
      if (piece.length >= 4) tokens.add(piece);
    }
    const titleSlug = slugify(title);
    if (titleSlug.length >= 4) tokens.add(titleSlug);
  }

  return [...tokens.values()];
}

function repositoryNameFromNameWithOwner(nameWithOwner: string): string {
  const parts = nameWithOwner.split("/");
  return (parts[parts.length - 1] ?? nameWithOwner).toLowerCase();
}

function scoreRepositoryMatch(
  repository: GitHubRepositoryCandidate,
  tokens: ReadonlyArray<string>,
): number {
  if (tokens.length === 0) return 0;
  const repoName = repositoryNameFromNameWithOwner(repository.nameWithOwner);
  let score = 0;
  for (const token of tokens) {
    if (repoName === token) score += 12;
    else if (repoName.startsWith(`${token}-`) || repoName.startsWith(token)) score += 8;
    else if (
      repoName.includes(`-${token}-`) ||
      repoName.includes(`-${token}`) ||
      repoName.includes(token)
    )
      score += 4;
  }
  return score;
}

export function collectSuggestedRepositoryUrls(input: {
  readonly repositories: ReadonlyArray<GitHubRepositoryCandidate>;
  readonly projectKey?: string;
  readonly projectTitle?: string;
  readonly linkedRepositoryUrls?: ReadonlyArray<string>;
}): ReadonlyArray<string> {
  const linked = new Set(normalizeRepositoryUrls(input.linkedRepositoryUrls));
  const tokens = collectProjectTokens({
    projectKey: input.projectKey,
    projectTitle: input.projectTitle,
  });
  if (tokens.length === 0) return [];

  const ranked = input.repositories
    .map((repository) => ({ repository, score: scoreRepositoryMatch(repository, tokens) }))
    .filter((entry) => entry.score > 0 && !linked.has(entry.repository.url))
    .toSorted((left, right) => right.score - left.score)
    .slice(0, 10)
    .map((entry) => entry.repository.url);

  return normalizeRepositoryUrls(ranked);
}

export function parseLinkedRepositoryName(host: string, repositoryUrl: string): string | undefined {
  try {
    const url = new URL(repositoryUrl);
    if (url.hostname.toLowerCase() !== host.toLowerCase()) return undefined;
    const [owner, repo] = url.pathname.split("/").filter((part) => part.length > 0);
    if (!owner || !repo) return undefined;
    return `${owner}/${repo.replace(/\.git$/i, "")}`;
  } catch {
    return undefined;
  }
}

export function hydrateInboxRepositoryUrls(
  host: string,
  items: ReadonlyArray<GitHubInboxItem>,
): ReadonlyArray<GitHubInboxItem> {
  return items.map((item) => ({
    ...item,
    ...(item.repositoryUrl ? {} : { repositoryUrl: `https://${host}/${item.repository}` }),
  }));
}

export function filterInboxItemsToLinkedRepositories(input: {
  readonly host: string;
  readonly inboxItems: ReadonlyArray<GitHubInboxItem>;
  readonly linkedRepositoryUrls?: ReadonlyArray<string>;
}): ReadonlyArray<GitHubInboxItem> {
  const linkedNormalized = new Set(normalizeRepositoryUrls(input.linkedRepositoryUrls));
  if (linkedNormalized.size === 0) return [];

  return input.inboxItems.filter((item) => {
    const repositoryUrl = normalizeRepositoryUrls([`https://${input.host}/${item.repository}`])[0];
    return typeof repositoryUrl === "string" && linkedNormalized.has(repositoryUrl);
  });
}

export function mergeGitHubActivityItems(input: {
  readonly notifications: ReadonlyArray<GitHubInboxItem>;
  readonly linkedPullRequests: ReadonlyArray<GitHubInboxItem>;
}): ReadonlyArray<GitHubInboxItem> {
  const merged = new Map<string, GitHubInboxItem>();
  for (const item of [...input.linkedPullRequests, ...input.notifications]) {
    const key = item.subjectUrl ?? item.id;
    if (!merged.has(key)) merged.set(key, item);
    else merged.set(key, { ...merged.get(key)!, ...item });
  }

  return [...merged.values()].toSorted((left, right) => {
    const leftMs = Date.parse(left.updatedAt ?? "");
    const rightMs = Date.parse(right.updatedAt ?? "");
    return (Number.isFinite(rightMs) ? rightMs : 0) - (Number.isFinite(leftMs) ? leftMs : 0);
  });
}
