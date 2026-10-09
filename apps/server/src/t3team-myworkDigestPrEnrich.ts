/**
 * One PR's enrichment for the digest — reviewers, who already engaged, unresolved threads, size,
 * body — through the shared cached PR detail/activity reads. Split from t3team-myworkDigestPr.ts.
 */

import type { PullRequestActor, PullRequestListEntry } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { PullRequestService } from "./pullRequest/PullRequestService.ts";
import { isRateLimitedFailure } from "./t3team-myworkDigestRateLimited.ts";
import type { T3TeamDigestPerson } from "./t3team-myworkDigestTypesPrs.ts";

export type PrEnrichment = {
  readonly author?: T3TeamDigestPerson;
  readonly reviewers: ReadonlyArray<T3TeamDigestPerson>;
  /** Everyone but the author who already commented or reviewed: the PR is not waiting on nobody. */
  readonly engaged?: ReadonlyArray<T3TeamDigestPerson>;
  readonly additions?: number;
  readonly deletions?: number;
  readonly unhandledReviewThreads: ReadonlyArray<{ readonly lastCommentAt?: string }>;
  readonly body: string;
};

export function toDigestPerson(actor: PullRequestActor): T3TeamDigestPerson {
  return {
    name: actor.name?.trim() || actor.login,
    login: actor.login,
    ...(actor.avatarUrl ? { avatarUrl: actor.avatarUrl } : {}),
  };
}

/**
 * GitHub's basic detail read carries no reviewer avatars; its conversation (activity) read does.
 * Every actor either read names, keyed by login, so a face found once is a face everywhere.
 */
function avatarsByLogin(actors: ReadonlyArray<PullRequestActor | null | undefined>) {
  const avatars = new Map<string, string>();
  for (const actor of actors) if (actor?.avatarUrl) avatars.set(actor.login, actor.avatarUrl);
  return (actor: PullRequestActor): PullRequestActor =>
    actor.avatarUrl ? actor : { ...actor, avatarUrl: avatars.get(actor.login) ?? null };
}

/** People who could take the review off the viewer: not the viewer, not a bot (Copilot, CI). */
function isOtherHuman(actor: PullRequestActor, viewer: string | undefined): boolean {
  return actor.isBot !== true && actor.login !== viewer;
}

function engagedPeople(
  authorLogin: string | undefined,
  viewer: string | undefined,
  activity: {
    readonly comments: ReadonlyArray<{ readonly author: PullRequestActor | null }>;
    readonly reviewThreads: ReadonlyArray<{
      readonly comments: ReadonlyArray<{ readonly author: PullRequestActor | null }>;
    }>;
  },
): NonNullable<PrEnrichment["engaged"]> {
  const byLogin = new Map<string, T3TeamDigestPerson>();
  const all = [
    ...activity.comments,
    ...activity.reviewThreads.flatMap((thread) => thread.comments),
  ];
  for (const comment of all) {
    const actor = comment.author;
    if (!actor || actor.login === authorLogin || byLogin.has(actor.login)) continue;
    if (isOtherHuman(actor, viewer)) byLogin.set(actor.login, toDigestPerson(actor));
  }
  return [...byLogin.values()];
}

/** Unresolved threads only, newest comment time where the host carried one. */
function mapUnhandledThreads(activity: {
  readonly reviewThreads: ReadonlyArray<{
    readonly isResolved: boolean;
    readonly comments: ReadonlyArray<{ readonly createdAt: string }>;
  }>;
}): PrEnrichment["unhandledReviewThreads"] {
  return activity.reviewThreads
    .filter((thread) => !thread.isResolved)
    .map((thread) => {
      const times = thread.comments
        .map((comment) => Date.parse(comment.createdAt))
        .filter((time) => Number.isFinite(time));
      return times.length > 0
        ? { lastCommentAt: DateTime.formatIso(DateTime.makeUnsafe(Math.max(...times))) }
        : {};
    });
}

// The last enrichment each PR read successfully, keyed by app project + host/repo#number. The shared
// reads expire after a minute and fail outright while the host's rate limit is paused; serving the
// last good enrichment then keeps names, faces and sizes on the digest instead of dropping every row
// back to bare logins until the quota resets. Only a rate limit falls back (see
// `isRateLimitedFailure`). Bounded: the oldest entry goes first.
const LAST_GOOD_CAPACITY = 500;
const lastGoodEnrichment = new Map<string, PrEnrichment>();

function rememberEnrichment(key: string, enrichment: PrEnrichment) {
  lastGoodEnrichment.delete(key);
  lastGoodEnrichment.set(key, enrichment);
  if (lastGoodEnrichment.size > LAST_GOOD_CAPACITY) {
    const oldest = lastGoodEnrichment.keys().next().value;
    if (oldest !== undefined) lastGoodEnrichment.delete(oldest);
  }
}

/**
 * One PR's detail + activity through the shared cached reads; when unreadable, the last enrichment
 * read for it this session, else undefined.
 */
export function enrichPr(
  service: PullRequestService["Service"],
  ref: {
    readonly projectId: PullRequestListEntry["projectId"];
    readonly host?: string;
    readonly repository: string;
    readonly number: number;
  },
) {
  const key = `${ref.projectId}:${ref.host ?? ""}/${ref.repository}#${ref.number}`;
  return Effect.all([service.detail(ref), service.activity(ref)], { concurrency: 2 }).pipe(
    Effect.map(([detail, activity]): PrEnrichment => {
      const withAvatar = avatarsByLogin([
        detail.author,
        activity.author,
        ...(activity.reviewers ?? []),
        ...activity.comments.map((comment) => comment.author),
        ...activity.reviewThreads.flatMap((thread) => thread.comments.map((c) => c.author)),
      ]);
      return {
        ...(detail.author ? { author: toDigestPerson(withAvatar(detail.author)) } : {}),
        reviewers: detail.reviewers
          .filter((reviewer) => isOtherHuman(reviewer, detail.viewer))
          .map((reviewer) => toDigestPerson(withAvatar(reviewer))),
        engaged: engagedPeople(detail.author?.login, detail.viewer, activity),
        additions: detail.additions,
        deletions: detail.deletions,
        unhandledReviewThreads: mapUnhandledThreads(activity),
        body: typeof detail.body === "string" ? detail.body : "",
      };
    }),
    Effect.tap((enrichment) => Effect.sync(() => rememberEnrichment(key, enrichment))),
    Effect.catch((error) =>
      Effect.succeed<PrEnrichment | undefined>(
        isRateLimitedFailure(error) ? lastGoodEnrichment.get(key) : undefined,
      ),
    ),
  );
}

/** An enrichment as PR-entry fields: faces, comments, who already engaged, size. */
export function digestEnrichmentFields(enrichment: PrEnrichment) {
  return {
    reviewers: enrichment.reviewers,
    ...(enrichment.author !== undefined ? { author: enrichment.author } : {}),
    unhandledReviewThreads: enrichment.unhandledReviewThreads,
    body: enrichment.body,
    ...(enrichment.engaged !== undefined ? { engaged: enrichment.engaged } : {}),
    ...(enrichment.additions !== undefined ? { additions: enrichment.additions } : {}),
    ...(enrichment.deletions !== undefined ? { deletions: enrichment.deletions } : {}),
  };
}
