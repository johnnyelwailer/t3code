import * as Effect from "effect/Effect";
import type * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import {
  isGitHubRateLimit,
  rateLimitMessage,
  readRestBody,
  type GitHubRateLimit,
} from "./t3team-githubRestRead.ts";
import type { GitHubInboxItem, RawGitHubPullRequest } from "./t3team-github-routes-shared.ts";
import {
  INBOX_CACHE_TTL_MS,
  pullRequestStateCache,
  readCached,
  readTrimmedString,
  writeCached,
} from "./t3team-github-routes-shared.ts";

function extractApiPath(subjectApiUrl: string): string | undefined {
  try {
    if (subjectApiUrl.startsWith("/")) return subjectApiUrl;
    const url = new URL(subjectApiUrl);
    const normalizedPath = url.pathname.startsWith("/api/v3/")
      ? `/${url.pathname.slice("/api/v3/".length)}`
      : url.pathname;
    return `${normalizedPath}${url.search}`;
  } catch {
    return undefined;
  }
}

/**
 * The host a subject's API URL belongs to, so its read carries that host's credential rather than
 * the inbox host's. A path-only URL is the inbox host's; an absolute one must be recognisable as
 * github.com (`api.github.com`), GHE.com (`api.<tenant>.ghe.com`) or Enterprise Server
 * (`<host>/api/v3/...`), and anything else names no host this read may use.
 */
function subjectApiHost(subjectApiUrl: string, inboxHost: string): string | undefined {
  if (subjectApiUrl.startsWith("/")) return inboxHost;
  try {
    const url = new URL(subjectApiUrl);
    const host = url.host.toLowerCase();
    if (host === "api.github.com") return "github.com";
    if (host.startsWith("api.") && host.endsWith(".ghe.com")) return host.slice("api.".length);
    return url.pathname.startsWith("/api/v3/") ? host : undefined;
  } catch {
    return undefined;
  }
}

function toGitHubWebUrl(
  host: string,
  repository: string,
  subjectApiUrl: string,
): string | undefined {
  const apiPath = extractApiPath(subjectApiUrl);
  if (!apiPath) return undefined;
  const pullMatch = apiPath.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)/i);
  if (pullMatch) return `https://${host}/${pullMatch[1]}/${pullMatch[2]}/pull/${pullMatch[3]}`;
  const issueMatch = apiPath.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)/i);
  if (issueMatch)
    return `https://${host}/${issueMatch[1]}/${issueMatch[2]}/issues/${issueMatch[3]}`;
  const [owner, repo] = repository.split("/");
  return owner && repo ? `https://${host}/${owner}/${repo}` : undefined;
}

function fetchPullRequestState(
  host: string,
  repository: string,
  subjectApiUrl: string,
  account?: string,
): Effect.Effect<
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
  >,
  GitHubRateLimit,
  GitHubApi.GitHubApi
> {
  const cacheKey = `${host}:${subjectApiUrl}`;
  const cached = readCached(pullRequestStateCache, cacheKey);
  if (cached) return Effect.succeed(cached);

  const apiPath = extractApiPath(subjectApiUrl);
  const apiHost = subjectApiHost(subjectApiUrl, host);
  if (!apiPath || apiHost === undefined) {
    const fallbackUrl = toGitHubWebUrl(host, repository, subjectApiUrl);
    return Effect.succeed({
      subjectState: "open",
      ...(fallbackUrl ? { subjectUrl: fallbackUrl } : {}),
    });
  }

  return readRestBody({ host: apiHost, operation: "t3team.github.pr-state", path: apiPath }).pipe(
    Effect.map((body) => {
      const parsed = JSON.parse(body) as RawGitHubPullRequest;
      const state = readTrimmedString(parsed.state)?.toLowerCase();
      const subjectState = parsed.merged_at
        ? "merged"
        : parsed.draft
          ? "draft"
          : state === "closed"
            ? "closed"
            : "open";
      const subjectUrl =
        readTrimmedString(parsed.html_url) ?? toGitHubWebUrl(host, repository, subjectApiUrl);
      const subjectBranch = readTrimmedString(parsed.head?.ref);
      const authorLogin = readTrimmedString(parsed.user?.login);
      const authorAvatarUrl = readTrimmedString(parsed.user?.avatar_url);
      const requestedReviewerLogins = (parsed.requested_reviewers ?? [])
        .map((reviewer) => readTrimmedString(reviewer.login)?.toLowerCase())
        .filter((value): value is string => typeof value === "string");
      const reviewRequested =
        typeof account === "string" && requestedReviewerLogins.includes(account.toLowerCase());
      const value = {
        subjectState,
        ...(subjectUrl ? { subjectUrl } : {}),
        ...(subjectBranch ? { subjectBranch } : {}),
        ...(authorLogin ? { authorLogin } : {}),
        ...(authorAvatarUrl ? { authorAvatarUrl } : {}),
        ...(reviewRequested ? { reviewRequested } : {}),
        ...(typeof parsed.comments === "number" ? { commentCount: parsed.comments } : {}),
        ...(typeof parsed.review_comments === "number"
          ? { reviewCommentCount: parsed.review_comments }
          : {}),
        ...(typeof parsed.additions === "number" ? { additions: parsed.additions } : {}),
        ...(typeof parsed.deletions === "number" ? { deletions: parsed.deletions } : {}),
        ...(typeof parsed.changed_files === "number" ? { changedFiles: parsed.changed_files } : {}),
      } as Pick<
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
      >;
      writeCached(pullRequestStateCache, cacheKey, value, INBOX_CACHE_TTL_MS);
      return value;
    }),
    // As under `gh`, a read that failed (not found, no credential for the host, ...) leaves the
    // row open. A rate limit is the exception: "open" would be a guess about a pull request the
    // read never saw, so it is handed up to be reported as the pause.
    Effect.catch((error) => {
      if (isGitHubRateLimit(error)) return Effect.fail(error);
      const fallbackUrl = toGitHubWebUrl(host, repository, subjectApiUrl);
      return Effect.succeed({
        subjectState: "open" as const,
        ...(fallbackUrl ? { subjectUrl: fallbackUrl } : {}),
      });
    }),
  );
}

/**
 * Each pull request item's state, read over `GitHubApi`. `pausedMessage` is set when the rate limit
 * held a read back: those rows keep their web link but carry no state, and the answer must not be
 * cached as if it were complete.
 */
export function enrichPullRequestState(
  host: string,
  items: ReadonlyArray<GitHubInboxItem>,
  account?: string,
): Effect.Effect<
  { readonly items: ReadonlyArray<GitHubInboxItem>; readonly pausedMessage?: string },
  never,
  GitHubApi.GitHubApi
> {
  type Enriched = { readonly item: GitHubInboxItem; readonly pausedMessage?: string };
  return Effect.forEach(
    items,
    (item): Effect.Effect<Enriched, never, GitHubApi.GitHubApi> => {
      const isPullRequest = item.subjectType?.toLowerCase() === "pullrequest";
      if (!item.subjectUrl) return Effect.succeed({ item });
      if (!isPullRequest) {
        const fallbackUrl = toGitHubWebUrl(host, item.repository, item.subjectUrl);
        return Effect.succeed({
          item: fallbackUrl ? Object.assign({}, item, { subjectUrl: fallbackUrl }) : item,
        });
      }

      return fetchPullRequestState(host, item.repository, item.subjectUrl, account).pipe(
        Effect.map((stateData) => {
          const nextItem = Object.assign({}, item);
          if (stateData.subjectUrl) {
            Object.assign(nextItem, { subjectUrl: stateData.subjectUrl });
          }
          if (stateData.subjectBranch) {
            Object.assign(nextItem, { subjectBranch: stateData.subjectBranch });
          }
          if (stateData.authorLogin) {
            Object.assign(nextItem, { authorLogin: stateData.authorLogin });
          }
          if (typeof stateData.reviewRequested === "boolean") {
            Object.assign(nextItem, { reviewRequested: stateData.reviewRequested });
          }
          if (stateData.subjectState) {
            Object.assign(nextItem, { subjectState: stateData.subjectState });
          }
          return { item: nextItem };
        }),
        Effect.catch((error) => {
          const fallbackUrl = toGitHubWebUrl(host, item.repository, item.subjectUrl ?? "");
          return Effect.succeed({
            item: fallbackUrl ? Object.assign({}, item, { subjectUrl: fallbackUrl }) : item,
            pausedMessage: rateLimitMessage(error),
          });
        }),
      );
    },
    { concurrency: 4 },
  ).pipe(
    Effect.map((results) => {
      const pausedMessage = results.find((result) => result.pausedMessage)?.pausedMessage;
      return {
        items: results.map((result) => result.item),
        ...(pausedMessage ? { pausedMessage } : {}),
      };
    }),
  );
}
