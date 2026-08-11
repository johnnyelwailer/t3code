import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { PullRequestRef } from "@t3tools/contracts";

import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import * as ProjectionSnapshotQuery from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import * as PullRequestService from "./pullRequest/PullRequestService.ts";
import { PullRequestProviderRegistry } from "./pullRequest/PullRequestProviderRegistry.ts";
import type {
  GitHubPullRequestContextRequest,
  GitHubPullRequestContextResponse,
} from "./t3team-github-routes-pr-types.ts";
import {
  toGitHubCommits,
  toGitHubIssueComments,
  toGitHubPullRequestDetails,
  toGitHubReviewComments,
  toGitHubReviews,
} from "./t3team-github-pr-context-adapter.ts";
import { EMPTY_ACTIVITY, loadFullDiff, optional } from "./t3team-github-pr-context-degradation.ts";
import { resolvePullRequestProjectId } from "./t3team-github-pr-project-resolver.ts";
import { parseUnifiedDiffToFiles } from "./t3team-github-unified-diff-parser.ts";
import { fetchFileSnapshots } from "./t3team-github-routes-pr-files.ts";
import {
  PULL_REQUEST_CONTEXT_CACHE_TTL_MS,
  pullRequestContextCache,
  readCached,
  readTrimmedString,
  writeCached,
} from "./t3team-github-routes-shared.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";

function cacheKey(input: { host: string; repository: string; pullRequestNumber: number }): string {
  return `${input.host}:${input.repository}:pr:${String(input.pullRequestNumber)}`;
}

function extractPullRequestNumber(input: {
  subjectUrl?: string;
  itemId?: string;
}): number | undefined {
  const candidates = [input.subjectUrl, input.itemId].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  for (const candidate of candidates) {
    const apiMatch = candidate.match(/\/pulls\/(\d+)(?:\D|$)/i);
    if (apiMatch) return Number(apiMatch[1]);
    const webMatch = candidate.match(/\/pull\/(\d+)(?:\D|$)/i);
    if (webMatch) return Number(webMatch[1]);
    const itemMatch = candidate.match(/:(\d+)(?:\D|$)/);
    if (itemMatch) return Number(itemMatch[1]);
  }
  return undefined;
}

export function loadPullRequestContext(
  input: GitHubPullRequestContextRequest,
): Effect.Effect<
  GitHubPullRequestContextResponse,
  T3TeamAtlassianError,
  | PullRequestService.PullRequestService
  | ProjectionSnapshotQuery.ProjectionSnapshotQuery
  | PullRequestProviderRegistry
> {
  const host = readTrimmedString(input.host) ?? "github.com";
  const repository = readTrimmedString(input.repository);
  if (!repository) {
    return Effect.fail(
      new T3TeamAtlassianError({ message: "GitHub pull request context requires a repository." }),
    );
  }

  const pullRequestNumber = extractPullRequestNumber({
    ...(input.subjectUrl ? { subjectUrl: input.subjectUrl } : {}),
    ...(input.itemId ? { itemId: input.itemId } : {}),
  });
  if (!pullRequestNumber) {
    return Effect.fail(
      new T3TeamAtlassianError({
        message: "Unable to resolve pull request number for GitHub context.",
      }),
    );
  }

  const key = cacheKey({ host, repository, pullRequestNumber });
  const cached = readCached(pullRequestContextCache, key);
  if (cached) return Effect.succeed(cached);

  return Effect.gen(function* () {
    const pullRequests = yield* PullRequestService.PullRequestService;
    const projectId = yield* resolvePullRequestProjectId({ host, repository });
    if (!projectId) {
      return yield* new T3TeamAtlassianError({
        message: `No open project checkout is bound to ${host}/${repository}.`,
      });
    }

    const ref = { projectId, repository, number: pullRequestNumber } as PullRequestRef;

    // The pull request itself is the one part nothing else can stand in for; everything else
    // degrades to empty-with-a-warning below rather than failing the whole context.
    const detail = yield* pullRequests
      .detail(ref)
      .pipe(
        Effect.mapError((cause) => toT3TeamError(cause, "Failed to load GitHub pull request.")),
      );

    const [activityResult, diffResult] = yield* Effect.all(
      [
        optional(
          pullRequests.activity(ref),
          EMPTY_ACTIVITY,
          "Unable to load pull request reviews, comments, and commits.",
        ),
        optional(
          loadFullDiff(pullRequests, ref),
          { text: "", truncated: false },
          "Unable to load the pull request diff.",
        ),
      ],
      { concurrency: 2 },
    );

    const activity = activityResult.value;
    const diffText = diffResult.value.text;
    const files = parseUnifiedDiffToFiles(diffText);
    const fileSnapshots = yield* fetchFileSnapshots({ pullRequests, ref, files });

    const warnings = [
      activityResult.warning,
      diffResult.warning,
      activity.commentsTruncated
        ? "Pull request comments were truncated by the host; not every comment is included."
        : undefined,
      diffResult.value.truncated
        ? "The pull request diff was truncated; some file changes may be incomplete."
        : undefined,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    const response = {
      host,
      repository,
      pullRequestNumber,
      capturedAt: DateTime.formatIso(yield* DateTime.now),
      pullRequest: toGitHubPullRequestDetails(detail, activity),
      files,
      reviews: toGitHubReviews(activity),
      reviewComments: toGitHubReviewComments(activity),
      issueComments: toGitHubIssueComments(activity),
      commits: toGitHubCommits(activity),
      fileSnapshots,
      ...(diffText ? { diff: diffText } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    } satisfies GitHubPullRequestContextResponse;

    writeCached(pullRequestContextCache, key, response, PULL_REQUEST_CONTEXT_CACHE_TTL_MS);
    return response;
  });
}
