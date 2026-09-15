/**
 * The personal burndown for the My Work Digest: remaining estimate of the
 * viewer's sprint items, per day, in the project's estimate unit.
 *
 * Pure on purpose — the 500-ticket aggregation test drives it. Per-item
 * status history is the union of the mirror's captured transitions (last 30
 * days) and the changelog backfill (whole sprint, once); the item's CURRENT
 * status is always the newest fact, so it is appended as a synthetic final
 * transition. Days with no known history fall back to the item's first known
 * "from" status, and to the current status if nothing at all is known — the
 * chart is then a lower bound on reality, which it labels by being sparse.
 */

import type {
  T3TeamDigestBurndown,
  T3TeamDigestProjectSource,
  T3TeamDigestTransition,
} from "./t3team-myworkDigestTypes.ts";

/** Mirror of the web digest's done-lane keywords (server has no web imports). */
const DONE_STATUS_KEYWORDS = ["done", "closed", "resolved", "cancelled", "canceled", "complete"];

/** The digest burndown never walks more than 60 days (a very long sprint). */
const MAX_BURNDOWN_DAYS = 60;

export function isDigestDoneStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "") return false;
  return DONE_STATUS_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

type HistoryEntry = { readonly from: string; readonly to: string; readonly at: string };

/** The item's full known timeline: captured + backfilled + the live status. */
function timelineFor(
  issueId: string,
  transitions: ReadonlyArray<T3TeamDigestTransition>,
  burndownTransitions: ReadonlyArray<T3TeamDigestTransition>,
  currentStatus: string | undefined,
  nowIso: string,
): HistoryEntry[] {
  const seen = new Set<string>();
  const entries: HistoryEntry[] = [];
  for (const row of [...transitions, ...burndownTransitions]) {
    if (row.ticketRef.issueId !== issueId) continue;
    const stamp = `${row.from}|${row.to}|${row.at}`;
    if (seen.has(stamp)) continue;
    seen.add(stamp);
    entries.push({ from: row.from, to: row.to, at: row.at });
  }
  if (currentStatus !== undefined && currentStatus !== "") {
    entries.push({ from: "", to: currentStatus, at: nowIso });
  }
  return entries.toSorted((a, b) => (a.at < b.at ? -1 : 1));
}

/** Status at end of `dayIso`, per the fallback chain documented above. */
function statusAtEndOfDay(entries: HistoryEntry[], dayIso: string): string | undefined {
  let last: HistoryEntry | undefined;
  for (const entry of entries) {
    if (entry.at <= dayIso) last = entry;
    else break;
  }
  if (last !== undefined) return last.to;
  const first = entries[0];
  return first !== undefined && first.from !== "" ? first.from : first?.to;
}

/** Inclusive UTC day range: start .. min(end, today), capped at 60 days. */
function dayRange(startDate: string, endDate: string, nowIso: string): string[] {
  const start = startDate.slice(0, 10);
  const last = endDate < nowIso ? endDate.slice(0, 10) : nowIso.slice(0, 10);
  if (start.length !== 10 || last.length !== 10 || start > last) return [];
  const days: string[] = [];
  let cursor = Date.UTC(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );
  const endUtc = Date.UTC(
    Number(last.slice(0, 4)),
    Number(last.slice(5, 7)) - 1,
    Number(last.slice(8, 10)),
  );
  while (cursor <= endUtc && days.length < MAX_BURNDOWN_DAYS) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
  }
  return days;
}

/**
 * The viewer's sprint items: mirror rows carrying this sprint's id (or name)
 * and the viewer's display name as assignee. Items without an estimate are
 * skipped — they cannot contribute to a burndown and pretending "0" would
 * flatten the line.
 */
export function assembleMyWorkDigestBurndown(
  source: Pick<
    T3TeamDigestProjectSource,
    "tickets" | "sprints" | "transitions" | "burndownTransitions" | "viewerName" | "estimateUnit"
  > & { readonly nowIso: string },
): T3TeamDigestBurndown | undefined {
  const viewerName = source.viewerName?.trim();
  if (viewerName === undefined || viewerName === "") return undefined;
  const sprint =
    source.sprints.find((sprint) => sprint.state?.toLowerCase() === "active") ?? source.sprints[0];
  if (sprint === undefined) return undefined;
  const unit = source.estimateUnit ?? "points";
  const nowIso = source.nowIso;

  const items = source.tickets
    .filter((ticket) => (ticket.assignee ?? "").trim().toLowerCase() === viewerName.toLowerCase())
    .filter(
      (ticket) =>
        (sprint.id !== undefined && ticket.sprintId === sprint.id) ||
        ticket.sprintName === sprint.name,
    )
    .filter((ticket) => typeof ticket.estimateValue === "number" && ticket.estimateValue > 0);
  if (items.length === 0) return undefined;

  const total = items.reduce((sum, ticket) => sum + (ticket.estimateValue ?? 0), 0);
  const days = dayRange(sprint.startDate ?? nowIso, sprint.endDate ?? nowIso, nowIso);
  if (days.length === 0) return undefined;
  const burndownTransitions = source.burndownTransitions ?? [];

  const points = days.map((day) => {
    const dayEndIso = `${day}T23:59:59.999Z`;
    let remaining = 0;
    for (const ticket of items) {
      const entries = timelineFor(
        String(ticket.id),
        source.transitions,
        burndownTransitions,
        ticket.status,
        nowIso,
      );
      const status = statusAtEndOfDay(entries, dayEndIso);
      if (status !== undefined && !isDigestDoneStatus(status))
        remaining += ticket.estimateValue ?? 0;
    }
    return { date: day, remaining };
  });

  return { unit, total, points };
}
