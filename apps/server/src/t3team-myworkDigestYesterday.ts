/**
 * One project's "yesterday" for the viewer: the PRs they merged and the tickets of theirs that
 * moved inside the window (`t3team-myworkDigestYesterdayWindow.ts`). Pure, so the time and the
 * reads stay with the caller.
 *
 * The mirror's status transitions carry no actor — Jira issues change status through Jira, and
 * the mirror only observes the new status at its next sync (`t3team-digestStatusTransitions.ts`).
 * So "the viewer's tickets that moved" means the viewer's assigned tickets: those with a transition
 * observed in the window (From -> To), and those Jira says were updated in it. A ticket someone
 * else moved while it was assigned to the viewer reads the same.
 */

import * as DateTime from "effect/DateTime";

import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { matchDigestWorkItemKey } from "./t3team-myworkDigestAggregation.ts";
import type {
  T3TeamDigestProjectSource,
  T3TeamDigestTransition,
} from "./t3team-myworkDigestTypes.ts";
import type {
  T3TeamDigestYesterday,
  T3TeamDigestYesterdayMoved,
} from "./t3team-myworkDigestTypesYesterday.ts";
import type { DigestYesterdayWindow } from "./t3team-myworkDigestYesterdayWindow.ts";

const YESTERDAY_ROW_LIMIT = 30;

const iso = (ms: number): string => DateTime.formatIso(DateTime.makeUnsafe(ms));

const inWindow = (iso: string | undefined, window: DigestYesterdayWindow): boolean => {
  const ms = iso === undefined ? Number.NaN : Date.parse(iso);
  return ms >= window.fromMs && ms < window.untilMs;
};

function movedTicket(
  ticket: BacklogResourceRef,
  transitions: ReadonlyArray<T3TeamDigestTransition>,
  window: DigestYesterdayWindow,
): T3TeamDigestYesterdayMoved | undefined {
  const ref = {
    issueId: String(ticket.id),
    ...(ticket.displayId !== undefined ? { issueKey: ticket.displayId } : {}),
  };
  const moves = transitions
    .filter(
      (t) =>
        inWindow(t.at, window) &&
        (t.ticketRef.issueId === ref.issueId ||
          (ref.issueKey !== undefined && t.ticketRef.issueKey === ref.issueKey)),
    )
    .toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const first = moves[0];
  const last = moves.at(-1);
  // Out and back (To Do -> Doing -> To Do) is not a move; fall through to "updated".
  if (first !== undefined && last !== undefined && first.from !== last.to) {
    return { ticketRef: ref, from: first.from, to: last.to, at: last.at };
  }
  return inWindow(ticket.updatedAt, window)
    ? { ticketRef: ref, at: ticket.updatedAt as string }
    : undefined;
}

export function assembleDigestYesterday(input: {
  readonly window: DigestYesterdayWindow;
  /** This project's share of the viewer's merged PRs (matched to its Jira keys by the caller). */
  readonly mergedEntries: T3TeamDigestProjectSource["prEntries"];
  /** The viewer's own tickets, without the parents the digest adds for context. */
  readonly assigned: ReadonlyArray<BacklogResourceRef>;
  readonly ticketKeys: ReadonlySet<string>;
  readonly transitions: ReadonlyArray<T3TeamDigestTransition>;
}): T3TeamDigestYesterday | undefined {
  const merged = input.mergedEntries
    .filter((entry) => entry.state === "merged")
    .map((entry) => {
      const workItemKey = matchDigestWorkItemKey(entry.title, entry.headBranch, input.ticketKeys);
      return {
        id: `${entry.host}:${entry.repository}#${entry.number}`,
        host: entry.host,
        repo: entry.repository,
        number: entry.number,
        title: entry.title,
        mergedAt: entry.updatedAt,
        ...(workItemKey !== undefined ? { workItemKey } : {}),
      };
    })
    .slice(0, YESTERDAY_ROW_LIMIT);
  const moved = input.assigned
    .flatMap((ticket) => movedTicket(ticket, input.transitions, input.window) ?? [])
    .toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, YESTERDAY_ROW_LIMIT);
  if (merged.length === 0 && moved.length === 0) return undefined;
  return {
    from: iso(input.window.fromMs),
    until: iso(input.window.untilMs),
    merged,
    moved,
  };
}
