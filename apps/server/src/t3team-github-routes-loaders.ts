import * as Effect from "effect/Effect";
import { resolveGitHubWorkItemKey } from "@t3tools/shared/t3team-githubActivity";
import type * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import {
  isGitHubRateLimit,
  rateLimitMessageOf,
  readRestBody,
  readRestPages,
} from "./t3team-githubRestRead.ts";
import { enrichPullRequestState } from "./t3team-github-routes-pr.ts";
import type {
  GitHubInboxAttempt,
  GitHubInboxItem,
  GitHubRepositoryCandidate,
  GitHubRepositoriesAttempt,
  RawGitHubNotification,
  RawGitHubRepo,
} from "./t3team-github-routes-shared.ts";
import { parseJsonArray, readTrimmedString } from "./t3team-github-routes-shared.ts";
import { collectProjectSearchTerms } from "./t3team-github-routes-suggestions.ts";

/** Marks an attempt the rate limit cut short, so the caller does not cache it. */
const pausedFlag = (error: unknown) => (isGitHubRateLimit(error) ? { paused: true as const } : {});

function mapRawRepositories(
  host: string,
  items: ReadonlyArray<RawGitHubRepo>,
): ReadonlyArray<GitHubRepositoryCandidate> {
  return items
    .map((item) => {
      const nameWithOwner = readTrimmedString(item.full_name);
      const url = readTrimmedString(item.html_url);
      const updatedAt = readTrimmedString(item.updated_at);
      const description = readTrimmedString(item.description);
      if (!nameWithOwner || !url) return undefined;
      return {
        id: String(item.id ?? `${host}:${nameWithOwner}`),
        nameWithOwner,
        url,
        host,
        ...(updatedAt ? { updatedAt } : {}),
        ...(description ? { description } : {}),
        ...(typeof item.private === "boolean" ? { isPrivate: item.private } : {}),
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== undefined)
    .toSorted((left, right) => left.nameWithOwner.localeCompare(right.nameWithOwner));
}

export function loadRepositoriesAttempt(
  host: string,
): Effect.Effect<GitHubRepositoriesAttempt, never, GitHubApi.GitHubApi> {
  return readRestPages<RawGitHubRepo>({
    host,
    operation: "t3team.github.repositories",
    path: "user/repos?per_page=100&affiliation=owner,organization_member",
  }).pipe(
    Effect.map((items) => mapRawRepositories(host, items)),
    Effect.match({
      onFailure: (error) => ({
        items: [] as ReadonlyArray<GitHubRepositoryCandidate>,
        warning:
          rateLimitMessageOf(error) ??
          "Unable to list repositories for this host (check host, permissions, or API availability).",
        ...pausedFlag(error),
      }),
      onSuccess: (items) => ({ items }),
    }),
  );
}

/** Fast path for project setup: search repository names instead of listing every accessible repo. */
export function loadRepositorySearchAttempt(
  host: string,
  input: { readonly projectKey?: string; readonly projectTitle?: string },
): Effect.Effect<GitHubRepositoriesAttempt, never, GitHubApi.GitHubApi> {
  const terms = collectProjectSearchTerms(input).slice(0, 4);
  if (terms.length === 0) return Effect.succeed({ items: [] });

  const query = terms.map((term) => `"${term}" in:name`).join(" OR ");
  return readRestBody({
    host,
    operation: "t3team.github.repository-search",
    path: `search/repositories?q=${encodeURIComponent(query)}&per_page=100`,
  }).pipe(
    Effect.map((body) => {
      try {
        const parsed = JSON.parse(body) as { readonly items?: unknown };
        return Array.isArray(parsed.items) ? parsed.items : [];
      } catch {
        return [];
      }
    }),
    Effect.map((items) => mapRawRepositories(host, items as ReadonlyArray<RawGitHubRepo>)),
    Effect.map((items) => ({ items })),
    Effect.match({
      onFailure: (error) => ({
        items: [] as ReadonlyArray<GitHubRepositoryCandidate>,
        warning:
          rateLimitMessageOf(error) ??
          "Unable to search repositories for this host (check API permissions).",
        ...pausedFlag(error),
      }),
      onSuccess: (value) => value,
    }),
  );
}

export function loadInboxAttempt(
  host: string,
  account?: string,
): Effect.Effect<GitHubInboxAttempt, never, GitHubApi.GitHubApi> {
  return readRestBody({
    host,
    operation: "t3team.github.inbox",
    path: "notifications?per_page=25",
  }).pipe(
    Effect.map((body) => parseJsonArray<RawGitHubNotification>(body, [])),
    Effect.map((items) =>
      items
        .map((item: RawGitHubNotification) => {
          const id = readTrimmedString(item.id);
          const repository = readTrimmedString(item.repository?.full_name);
          const reason = readTrimmedString(item.reason);
          const subjectType = readTrimmedString(item.subject?.type);
          const subjectTitle = readTrimmedString(item.subject?.title);
          const subjectApiUrl = readTrimmedString(item.subject?.url);
          const updatedAt = readTrimmedString(item.updated_at);
          if (!id || !repository || !reason) return undefined;
          // Stamped here as well as in `loadLinkedPullRequestsAttempt`, because these are the
          // only two producers of `GitHubInboxItem` and a caller with no browser cannot tell
          // which path an item came from. Stamping one and not the other would make the field
          // silently unreliable — worse than absent. A notification carries no head branch, so
          // the precedence chain resolves from title, then repository name.
          const workItemKey = resolveGitHubWorkItemKey({
            ...(subjectTitle ? { subjectTitle } : {}),
            repository,
          });
          const inboxItem: GitHubInboxItem = {
            id,
            repository,
            repositoryUrl: `https://${host}/${repository}`,
            reason,
            ...(reason.toLowerCase() === "review_requested" ? { reviewRequested: true } : {}),
            ...(subjectType ? { subjectType } : {}),
            ...(subjectTitle ? { subjectTitle } : {}),
            ...(subjectApiUrl ? { subjectUrl: subjectApiUrl } : {}),
            ...(updatedAt ? { updatedAt } : {}),
            ...(workItemKey ? { workItemKey } : {}),
          };
          return inboxItem;
        })
        .filter((value): value is GitHubInboxItem => value !== undefined),
    ),
    Effect.flatMap((items) => enrichPullRequestState(host, items, account)),
    Effect.match({
      onFailure: (error): GitHubInboxAttempt => ({
        items: [],
        warning:
          rateLimitMessageOf(error) ??
          "Unable to load GitHub inbox (notifications scope may be missing).",
        ...pausedFlag(error),
      }),
      onSuccess: ({ items, pausedMessage }): GitHubInboxAttempt =>
        pausedMessage === undefined ? { items } : { items, warning: pausedMessage, paused: true },
    }),
  );
}
