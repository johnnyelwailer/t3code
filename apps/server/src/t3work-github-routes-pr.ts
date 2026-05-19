import * as Effect from "effect/Effect";
import type { VcsProcessShape } from "./vcs/VcsProcess.ts";
import type { GitHubInboxItem, RawGitHubPullRequest } from "./t3work-github-routes-shared.ts";
import {
  INBOX_CACHE_TTL_MS,
  pullRequestStateCache,
  readCached,
  readTrimmedString,
  writeCached,
} from "./t3work-github-routes-shared.ts";

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
  vcs: VcsProcessShape,
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
  never,
  never
> {
  const cacheKey = `${host}:${subjectApiUrl}`;
  const cached = readCached(pullRequestStateCache, cacheKey);
  if (cached) return Effect.succeed(cached);

  const apiPath = extractApiPath(subjectApiUrl);
  if (!apiPath) {
    const fallbackUrl = toGitHubWebUrl(host, repository, subjectApiUrl);
    return Effect.succeed({
      subjectState: "open",
      ...(fallbackUrl ? { subjectUrl: fallbackUrl } : {}),
    });
  }

  return vcs
    .run({
      operation: "t3work.github.pr-state",
      command: "gh",
      args: ["api", "--hostname", host, apiPath],
      cwd: process.cwd(),
    })
    .pipe(
      Effect.map((output) => {
        const parsed = JSON.parse(output.stdout) as RawGitHubPullRequest;
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
          ...(typeof parsed.changed_files === "number"
            ? { changedFiles: parsed.changed_files }
            : {}),
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
      Effect.catch(() => {
        const fallbackUrl = toGitHubWebUrl(host, repository, subjectApiUrl);
        return Effect.succeed({
          subjectState: "open" as const,
          ...(fallbackUrl ? { subjectUrl: fallbackUrl } : {}),
        });
      }),
    );
}

export function enrichPullRequestState(
  vcs: VcsProcessShape,
  host: string,
  items: ReadonlyArray<GitHubInboxItem>,
  account?: string,
): Effect.Effect<ReadonlyArray<GitHubInboxItem>, never, never> {
  return Effect.forEach(
    items,
    (item) => {
      const isPullRequest = item.subjectType?.toLowerCase() === "pullrequest";
      if (!item.subjectUrl) return Effect.succeed(item);
      if (!isPullRequest) {
        const fallbackUrl = toGitHubWebUrl(host, item.repository, item.subjectUrl);
        return Effect.succeed({ ...item, ...(fallbackUrl ? { subjectUrl: fallbackUrl } : {}) });
      }

      return fetchPullRequestState(vcs, host, item.repository, item.subjectUrl, account).pipe(
        Effect.map((stateData) => ({
          ...item,
          ...(stateData.subjectUrl ? { subjectUrl: stateData.subjectUrl } : {}),
          ...(stateData.subjectBranch ? { subjectBranch: stateData.subjectBranch } : {}),
          ...(stateData.authorLogin ? { authorLogin: stateData.authorLogin } : {}),
          ...(typeof stateData.reviewRequested === "boolean"
            ? { reviewRequested: stateData.reviewRequested }
            : {}),
          ...(stateData.subjectState ? { subjectState: stateData.subjectState } : {}),
        })),
      );
    },
    { concurrency: 4 },
  );
}
