import * as Effect from "effect/Effect";

import type { PullRequestActivity, PullRequestRef } from "@t3tools/contracts";

import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import type * as PullRequestService from "./pullRequest/PullRequestService.ts";

/**
 * `activity` and `diff` are read independently of `detail` and of each other, the way the
 * pre-upstream version wrapped GitHub's reviews/comments/commits/diff reads in `optionalArray`/
 * `optionalText`: a provider without diff support (Azure DevOps), or one host read failing,
 * degrades that one part of the bundle to empty-with-a-warning rather than failing the whole
 * pull request context.
 */
export function optional<A, E>(
  effect: Effect.Effect<A, E, never>,
  empty: A,
  warning: string,
): Effect.Effect<{ readonly value: A; readonly warning?: string }, never, never> {
  return effect.pipe(
    Effect.map((value) => ({ value })),
    Effect.catch(() => Effect.succeed({ value: empty, warning })),
  );
}

export const EMPTY_ACTIVITY: PullRequestActivity = {
  comments: [],
  commentCount: 0,
  commentsTruncated: false,
  reviewThreads: [],
  commits: [],
};

/**
 * The largest diff this route will assemble before giving up. A well-behaved provider finishes
 * in a handful of slices; this exists only so a provider bug that repeats or never ends its own
 * cursor fails loudly and quickly instead of growing `acc` and looping forever.
 */
const MAX_DIFF_PAGES = 100;

export interface DiffAssembly {
  readonly text: string;
  /** Any page reported `truncated`, or the diff hit `MAX_DIFF_PAGES` — either way, incomplete. */
  readonly truncated: boolean;
}

/** `diff()` is cursor-paginated; the bundle wants the whole unified patch as one string. */
export function loadFullDiff(
  pullRequests: PullRequestService.PullRequestService["Service"],
  ref: PullRequestRef,
): Effect.Effect<DiffAssembly, PullRequestService.PullRequestError | T3TeamAtlassianError, never> {
  const seenCursors = new Set<string>();
  const loop = (
    cursor: string | undefined,
    acc: string,
    truncated: boolean,
    page: number,
  ): Effect.Effect<
    DiffAssembly,
    PullRequestService.PullRequestError | T3TeamAtlassianError,
    never
  > => {
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
        const nextTruncated = truncated || result.truncated;
        if (!result.nextCursor) return Effect.succeed({ text: next, truncated: nextTruncated });
        if (seenCursors.has(result.nextCursor)) {
          return Effect.fail(
            new T3TeamAtlassianError({
              message: "GitHub pull request diff pagination returned a repeated cursor.",
            }),
          );
        }
        seenCursors.add(result.nextCursor);
        return loop(result.nextCursor, next, nextTruncated, page + 1);
      }),
    );
  };
  return loop(undefined, "", false, 1);
}
