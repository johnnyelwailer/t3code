/**
 * The Tier A diff logic (GHE #332, design 42 §8) — the pure half of the `scm.change-request.*`
 * instances: one observed PR (detail + activity) is diffed against the last observed snapshot
 * and the TRANSITIONS become events. Split from the poller so the "what changed" decision stays
 * testable in isolation.
 *
 * A first observation is a BASELINE, never an event — a source that starts on an
 * already-merged PR does not fire its `merged` signal retroactively. The snapshot is what the
 * poller persists as the durable cursor, so a transition observed after a restart is emitted
 * exactly because the cursor remembers the state from before.
 *
 * The payload is the neutral `ChangeRequest` vocabulary the SDK's built-in signals declare
 * (t3team-sdk.builtinSignals.ts); the provider shape is mapped at this boundary and nowhere else.
 */

import {
  ScmChangeRequestChecksConcluded,
  ScmChangeRequestClosed,
  ScmChangeRequestDraftReady,
  ScmChangeRequestMerged,
  ScmChangeRequestReviewActivity,
} from "@t3team/sdk";

import type { PullRequestActivity, PullRequestDetail } from "@t3tools/contracts";

/** One observed PR state, diffed against the previous one. Pure: the poller's whole
 * "what happened since last time" decision. */
export interface ScmSnapshot {
  readonly state: string;
  readonly isDraft: boolean;
  /** check name → last status (the transition set is computed over terminal statuses). */
  readonly checks: Readonly<Record<string, string>>;
  /** Ids already observed, so a new review thread / comment is emitted exactly once. */
  readonly reviewIds: ReadonlyArray<string>;
  readonly commentIds: ReadonlyArray<string>;
}

export interface ScmEvent {
  readonly signalName: string;
  readonly payload: unknown;
}

const TERMINAL_CHECK_STATUSES = new Set([
  "success",
  "failure",
  "skipped",
  "neutral",
  "cancelled",
]);
const MAX_REVIEW_EVENTS_PER_POLL = 5;

/** Map the provider detail to the neutral change-request payload every Tier A signal carries. */
export function toNeutralChangeRequest(detail: PullRequestDetail): {
  readonly provider: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly state: string;
  readonly isDraft: boolean;
  readonly mergedAt?: string;
  readonly closedAt?: string;
} {
  return {
    provider: detail.provider,
    number: detail.number,
    title: detail.title,
    url: detail.url,
    baseRef: detail.baseBranch,
    headRef: detail.headBranch,
    state: detail.state,
    isDraft: detail.isDraft,
    ...(detail.mergedAt !== null ? { mergedAt: detail.mergedAt } : {}),
    ...(detail.closedAt !== null ? { closedAt: detail.closedAt } : {}),
  };
}

/** Diff one observed (detail, activity) against the previous snapshot → the events fired. */
export function diffScmEvents(
  prev: ScmSnapshot | null,
  detail: PullRequestDetail,
  activity: PullRequestActivity | null,
): { readonly events: ReadonlyArray<ScmEvent>; readonly snapshot: ScmSnapshot } {
  const cr = toNeutralChangeRequest(detail);
  const snapshot: ScmSnapshot = {
    state: detail.state,
    isDraft: detail.isDraft,
    checks: Object.fromEntries(detail.checks.map((c) => [c.name, c.status])),
    reviewIds: activity?.reviewThreads.map((t) => t.id) ?? [],
    commentIds: activity?.comments.map((c) => c.id) ?? [],
  };
  if (prev === null) return { events: [], snapshot }; // baseline, never retroactive

  const events: ScmEvent[] = [];
  if (prev.state === "open" && detail.state === "merged") {
    events.push({ signalName: ScmChangeRequestMerged.name, payload: { changeRequest: cr } });
  }
  if (prev.state === "open" && detail.state === "closed") {
    events.push({ signalName: ScmChangeRequestClosed.name, payload: { changeRequest: cr } });
  }
  if (prev.isDraft === true && detail.isDraft === false && detail.state === "open") {
    events.push({ signalName: ScmChangeRequestDraftReady.name, payload: { changeRequest: cr } });
  }
  // Checks: emit for each check that reached a NEW terminal status since last poll.
  for (const check of detail.checks) {
    if (!TERMINAL_CHECK_STATUSES.has(check.status)) continue;
    if (prev.checks[check.name] === check.status) continue;
    const totals = { total: 0, passed: 0, failed: 0, pending: 0 };
    for (const c of detail.checks) {
      totals.total += 1;
      if (c.status === "success" || c.status === "skipped") totals.passed += 1;
      else if (c.status === "failure" || c.status === "action-required") totals.failed += 1;
      else totals.pending += 1;
    }
    events.push({
      signalName: ScmChangeRequestChecksConcluded.name,
      payload: {
        changeRequest: cr,
        conclusion: check.status,
        total: totals.total,
        passed: totals.passed,
        failed: totals.failed,
        pending: totals.pending,
      },
    });
  }
  // Review activity: each NEW review thread / comment since last poll is one event (bounded).
  if (activity !== null) {
    const newThreads = activity.reviewThreads.filter((t) => !prev.reviewIds.includes(t.id));
    const newComments = activity.comments.filter((c) => !prev.commentIds.includes(c.id));
    const fresh = [
      ...newThreads.map(() => ({
        reviewer: "unknown" as string,
        action: "thread" as string,
        comment: undefined as string | undefined,
        threadUrl: undefined as string | undefined,
      })),
      ...newComments.map((c) => ({
        reviewer: c.author?.name ?? c.author?.login ?? "unknown",
        action: c.reviewState ?? "comment",
        comment: c.body.slice(0, 500),
        threadUrl: c.url ?? undefined,
      })),
    ].slice(0, MAX_REVIEW_EVENTS_PER_POLL);
    for (const item of fresh) {
      events.push({
        signalName: ScmChangeRequestReviewActivity.name,
        payload: {
          changeRequest: cr,
          reviewer: item.reviewer,
          action: item.action,
          ...(item.comment === undefined ? {} : { comment: item.comment }),
          ...(item.threadUrl === undefined ? {} : { threadUrl: item.threadUrl }),
        },
      });
    }
  }
  return { events, snapshot };
}
