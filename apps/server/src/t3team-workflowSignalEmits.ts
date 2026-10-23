/**
 * Which signals each built-in source may emit (the delivery trust boundary the reconciler mints
 * into every instance's `ctx.emit`), and which sources' undelivered inbox slots are bounded.
 */
import {
  ScmChangeRequestChecksConcluded,
  ScmChangeRequestClosed,
  ScmChangeRequestDraftReady,
  ScmChangeRequestMerged,
  ScmChangeRequestReviewActivity,
  ScmProjectItemUpdated,
  ScmViewerChangeRequestUpdated,
  WorkItemUpdated,
} from "@t3team/sdk";

/** The delivery trust boundary per source name: only the declared signals may be emitted. */
export const EMITS_BY_SOURCE: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  (
    [
      [
        "scm.change-request.watch",
        [ScmChangeRequestMerged.name, ScmChangeRequestClosed.name, ScmChangeRequestDraftReady.name],
      ],
      ["scm.change-request.checks", [ScmChangeRequestChecksConcluded.name]],
      ["scm.change-request.review", [ScmChangeRequestReviewActivity.name]],
      ["scm.viewer.change-requests", [ScmViewerChangeRequestUpdated.name]],
      ["scm.project.items", [ScmProjectItemUpdated.name]],
      ["work-item.updates", [WorkItemUpdated.name]],
      ["work-item.project-updates", [WorkItemUpdated.name]],
    ] as const
  ).map(([name, signals]) => [name, new Set(signals)]),
);

/**
 * Sources whose events may never be drained (they fire for every matching change whether or not a
 * run is waiting, and the trigger runner that drains them is optional), so their UNDELIVERED inbox
 * slots are bounded: dropped past the inbox TTL, and past the newest `UNDRAINED_INBOX_CAP`.
 * Stale events must not later launch work, and the table must not grow without limit.
 */
export const BOUNDED_INBOX_SOURCES = [
  "scm.viewer.change-requests",
  "scm.project.items",
  "work-item.project-updates",
] as const;
export const UNDRAINED_INBOX_CAP = 1_000;
