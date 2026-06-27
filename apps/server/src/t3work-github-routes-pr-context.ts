import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { VcsError } from "@t3tools/contracts";

import { T3workAtlassianError } from "./t3work-atlassian-http.ts";
import type { VcsProcessShape } from "./t3work-vcsProcessShape.ts";
import type {
  GitHubPullRequestContextCommit,
  GitHubPullRequestContextDetails,
  GitHubPullRequestContextFile,
  GitHubPullRequestContextIssueComment,
  GitHubPullRequestContextRequest,
  GitHubPullRequestContextResponse,
  GitHubPullRequestContextReview,
  GitHubPullRequestContextReviewComment,
} from "./t3work-github-routes-pr-types.ts";
import {
  encodeRepositoryPath,
  extractPullRequestNumber,
  runJsonObject,
  runPaginatedArray,
  runText,
} from "./t3work-github-routes-pr-api.ts";
import { fetchFileSnapshots } from "./t3work-github-routes-pr-files.ts";
import {
  PULL_REQUEST_CONTEXT_CACHE_TTL_MS,
  pullRequestContextCache,
  readCached,
  readTrimmedString,
  writeCached,
} from "./t3work-github-routes-shared.ts";
import { toT3workError } from "./t3work-project-repository-utils.ts";

function cacheKey(input: { host: string; repository: string; pullRequestNumber: number }): string {
  return `${input.host}:${input.repository}:pr:${String(input.pullRequestNumber)}`;
}

function optionalArray<T>(
  effect: Effect.Effect<ReadonlyArray<T>, VcsError, never>,
  warning: string,
): Effect.Effect<{ readonly value: ReadonlyArray<T>; readonly warning?: string }, never, never> {
  return effect.pipe(
    Effect.map((value) => ({ value })),
    Effect.catch(() => Effect.succeed({ value: [] as ReadonlyArray<T>, warning })),
  );
}

function optionalText(
  effect: Effect.Effect<string, VcsError, never>,
  warning: string,
): Effect.Effect<{ readonly value?: string; readonly warning?: string }, never, never> {
  return effect.pipe(
    Effect.map((value) => ({ value })),
    Effect.catch(() => Effect.succeed({ warning })),
  );
}

export function loadPullRequestContext(
  vcs: VcsProcessShape,
  input: GitHubPullRequestContextRequest,
): Effect.Effect<GitHubPullRequestContextResponse, T3workAtlassianError, never> {
  const host = readTrimmedString(input.host) ?? "github.com";
  const repository = readTrimmedString(input.repository);
  if (!repository) {
    return Effect.fail(
      new T3workAtlassianError({
        message: "GitHub pull request context requires a repository.",
      }),
    );
  }

  const pullRequestNumber = extractPullRequestNumber({
    ...(input.subjectUrl ? { subjectUrl: input.subjectUrl } : {}),
    ...(input.itemId ? { itemId: input.itemId } : {}),
  });
  if (!pullRequestNumber) {
    return Effect.fail(
      new T3workAtlassianError({
        message: "Unable to resolve pull request number for GitHub context.",
      }),
    );
  }

  const key = cacheKey({ host, repository, pullRequestNumber });
  const cached = readCached(pullRequestContextCache, key);
  if (cached) return Effect.succeed(cached);

  const repositoryPath = encodeRepositoryPath(repository);
  const pullRequestPath = `/repos/${repositoryPath}/pulls/${String(pullRequestNumber)}`;

  return Effect.gen(function* () {
    const pullRequest = yield* runJsonObject<GitHubPullRequestContextDetails>({
      vcs,
      host,
      operation: "t3work.github.pr-context.pull-request",
      path: pullRequestPath,
      accept: "application/vnd.github.full+json",
      maxOutputBytes: 2_000_000,
    }).pipe(
      Effect.mapError((cause) => toT3workError(cause, "Failed to load GitHub pull request.")),
    );

    const files = yield* runPaginatedArray<GitHubPullRequestContextFile>({
      vcs,
      host,
      operation: "t3work.github.pr-context.files",
      path: `${pullRequestPath}/files`,
      accept: "application/vnd.github+json",
      maxOutputBytes: 8_000_000,
    }).pipe(
      Effect.mapError((cause) => toT3workError(cause, "Failed to load GitHub pull request files.")),
    );

    const [reviewsResult, reviewCommentsResult, issueCommentsResult, commitsResult, diffResult] =
      yield* Effect.all([
        optionalArray(
          runPaginatedArray<GitHubPullRequestContextReview>({
            vcs,
            host,
            operation: "t3work.github.pr-context.reviews",
            path: `${pullRequestPath}/reviews`,
            accept: "application/vnd.github.full+json",
            maxOutputBytes: 4_000_000,
          }),
          "Unable to load pull request reviews.",
        ),
        optionalArray(
          runPaginatedArray<GitHubPullRequestContextReviewComment>({
            vcs,
            host,
            operation: "t3work.github.pr-context.review-comments",
            path: `${pullRequestPath}/comments`,
            accept: "application/vnd.github.full+json",
            maxOutputBytes: 8_000_000,
          }),
          "Unable to load pull request review comments.",
        ),
        optionalArray(
          runPaginatedArray<GitHubPullRequestContextIssueComment>({
            vcs,
            host,
            operation: "t3work.github.pr-context.issue-comments",
            path: `/repos/${repositoryPath}/issues/${String(pullRequestNumber)}/comments`,
            accept: "application/vnd.github.full+json",
            maxOutputBytes: 4_000_000,
          }),
          "Unable to load pull request issue comments.",
        ),
        optionalArray(
          runPaginatedArray<GitHubPullRequestContextCommit>({
            vcs,
            host,
            operation: "t3work.github.pr-context.commits",
            path: `${pullRequestPath}/commits`,
            accept: "application/vnd.github+json",
            maxOutputBytes: 4_000_000,
          }),
          "Unable to load pull request commits.",
        ),
        optionalText(
          runText({
            vcs,
            host,
            operation: "t3work.github.pr-context.diff",
            path: pullRequestPath,
            accept: "application/vnd.github.v3.diff",
            maxOutputBytes: 12_000_000,
          }),
          "Unable to load pull request diff.",
        ),
      ]);

    const fileSnapshots = yield* fetchFileSnapshots({
      vcs,
      host,
      repository,
      pullRequest,
      files,
    });

    const warnings = [
      reviewsResult.warning,
      reviewCommentsResult.warning,
      issueCommentsResult.warning,
      commitsResult.warning,
      diffResult.warning,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    const response = {
      host,
      repository,
      pullRequestNumber,
      capturedAt: DateTime.formatIso(yield* DateTime.now),
      pullRequest,
      files,
      reviews: reviewsResult.value,
      reviewComments: reviewCommentsResult.value,
      issueComments: issueCommentsResult.value,
      commits: commitsResult.value,
      fileSnapshots,
      ...(diffResult.value ? { diff: diffResult.value } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    } satisfies GitHubPullRequestContextResponse;

    writeCached(pullRequestContextCache, key, response, PULL_REQUEST_CONTEXT_CACHE_TTL_MS);
    return response;
  });
}
