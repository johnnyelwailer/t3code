import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { PullRequestRef } from "@t3tools/contracts";

import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import * as ProjectionSnapshotQuery from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import * as PullRequestService from "./pullRequest/PullRequestService.ts";
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

/**
 * The largest diff this route will assemble before giving up. A well-behaved provider finishes
 * in a handful of slices; this exists only so a provider bug that repeats or never ends its own
 * cursor fails loudly and quickly instead of growing `acc` and looping forever.
 */
const MAX_DIFF_PAGES = 100;

/** `diff()` is cursor-paginated; the bundle wants the whole unified patch as one string. */
function loadFullDiff(
  pullRequests: PullRequestService.PullRequestService["Service"],
  ref: PullRequestRef,
): Effect.Effect<string, PullRequestService.PullRequestError | T3TeamAtlassianError, never> {
  const seenCursors = new Set<string>();
  const loop = (
    cursor: string | undefined,
    acc: string,
    page: number,
  ): Effect.Effect<string, PullRequestService.PullRequestError | T3TeamAtlassianError, never> => {
    if (page > MAX_DIFF_PAGES) {
      return Effect.fail(
        new T3TeamAtlassianError({
          message: `GitHub pull request diff did not finish paginating after ${String(MAX_DIFF_PAGES)} pages.`,
        }),
      );
    }
    return pullRequests.diff({ ...ref, ...(cursor ? { cursor } : {}) }).pipe(
      Effect.flatMap((result) => {
        const next = acc + result.patch;
        if (!result.nextCursor) return Effect.succeed(next);
        if (seenCursors.has(result.nextCursor)) {
          return Effect.fail(
            new T3TeamAtlassianError({
              message: "GitHub pull request diff pagination returned a repeated cursor.",
            }),
          );
        }
        seenCursors.add(result.nextCursor);
        return loop(result.nextCursor, next, page + 1);
      }),
    );
  };
  return loop(undefined, "", 1);
}

export function loadPullRequestContext(
  input: GitHubPullRequestContextRequest,
): Effect.Effect<
  GitHubPullRequestContextResponse,
  T3TeamAtlassianError,
  PullRequestService.PullRequestService | ProjectionSnapshotQuery.ProjectionSnapshotQuery
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

    const [detail, activity, diffText] = yield* Effect.all(
      [pullRequests.detail(ref), pullRequests.activity(ref), loadFullDiff(pullRequests, ref)],
      { concurrency: 3 },
    ).pipe(Effect.mapError((cause) => toT3TeamError(cause, "Failed to load GitHub pull request.")));

    const files = parseUnifiedDiffToFiles(diffText);
    const fileSnapshots = yield* fetchFileSnapshots({ pullRequests, ref, files });

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
    } satisfies GitHubPullRequestContextResponse;

    writeCached(pullRequestContextCache, key, response, PULL_REQUEST_CONTEXT_CACHE_TTL_MS);
    return response;
  });
}
