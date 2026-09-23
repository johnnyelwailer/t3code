/**
 * Blocker resolution for the My Work Digest graph: which PRs gate which of
 * the project's tickets.
 *
 * Two sources, both already in memory for this round (zero extra reads):
 *
 *  (a) Jira issue links. The mirror walk fetches `issuelinks` on every issue
 *      (the Atlassian provider's base field set), and `toBacklogItem` surfaces
 *      the outward direction on the mirror row. A link whose outward label
 *      says "is blocked by" (or a synonym) points at the ticket this one
 *      waits for; the PR implementing THAT ticket — found with the same
 *      key-in-title heuristic as `workItemKey` — is the blocker.
 *
 *  (b) PR body mentions: "blocked by owner/repo#123" / "depends on
 *      owner/repo#123". The body is available for open PRs through the digest
 *      detail enrichment; the mentioning PR's own ticket is the blocked side.
 */

import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { matchDigestWorkItemKey } from "./t3team-myworkDigestAggregation.ts";
import type {
  T3TeamDigestBlocker,
  T3TeamDigestProjectSource,
  T3TeamDigestTicketRef,
} from "./t3team-myworkDigestTypes.ts";

/** Jira link labels that mean "this issue waits on the linked one". */
const BLOCKING_LINK = /is blocked by|is a dependency of|is dependent on|is waiting on/i;

/** "blocked by owner/repo#123", "depends on owner/repo#123", "waiting on …" in PR bodies. */
const PR_BODY_MENTION =
  /(?:blocked\s+by|depends\s+on|waiting\s+on)\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)/gi;

function ticketRefOf(ticket: BacklogResourceRef): T3TeamDigestTicketRef {
  return {
    issueId: String(ticket.id),
    ...(ticket.displayId !== undefined ? { issueKey: ticket.displayId } : {}),
  };
}

/**
 * One pass over the source: a key → PRs index for the link path, then the two
 * sources. O(tickets × links + prEntries + body matches), no per-PR scans.
 */
export function assembleMyWorkDigestBlockers(
  source: Pick<T3TeamDigestProjectSource, "tickets" | "prEntries">,
): T3TeamDigestBlocker[] {
  const ticketKeys = new Set(
    source.tickets
      .map((ticket) => (ticket.displayId ?? "").toUpperCase())
      .filter((key) => key !== ""),
  );
  // Which PR implements which of this project's tickets (the same heuristic
  // the change requests use), so a link target resolves without re-matching.
  const prsByTicketKey = new Map<string, Array<T3TeamDigestProjectSource["prEntries"][number]>>();
  for (const entry of source.prEntries) {
    const key = matchDigestWorkItemKey(entry.title, entry.headBranch, ticketKeys);
    if (key !== undefined) {
      const list = prsByTicketKey.get(key);
      if (list === undefined) prsByTicketKey.set(key, [entry]);
      else list.push(entry);
    }
  }
  const ticketByKey = new Map(
    source.tickets
      .filter((ticket) => (ticket.displayId ?? "").toUpperCase() !== "")
      .map((ticket) => [ticket.displayId!.toUpperCase(), ticket]),
  );

  const blockers: T3TeamDigestBlocker[] = [];
  const seen = new Set<string>();
  const push = (ticketRef: T3TeamDigestTicketRef, repo: string, number: number): void => {
    const id = `${ticketRef.issueKey ?? ticketRef.issueId ?? ""}|${repo}#${number}`;
    if (seen.has(id)) return;
    seen.add(id);
    blockers.push({ ticketRef, repo, number });
  };

  // (a) Jira "is blocked by" links: my ticket → target ticket → its PRs.
  for (const ticket of source.tickets) {
    for (const link of ticket.links ?? []) {
      if (!BLOCKING_LINK.test(link.outward)) continue;
      const prs = prsByTicketKey.get(link.key.toUpperCase());
      if (prs !== undefined)
        for (const entry of prs) push(ticketRefOf(ticket), entry.repository, entry.number);
    }
  }

  // (b) The PR body names the PR that gates its own ticket.
  for (const entry of source.prEntries) {
    if (entry.body === undefined || entry.body === "") continue;
    const workItemKey = matchDigestWorkItemKey(entry.title, entry.headBranch, ticketKeys);
    if (workItemKey === undefined) continue;
    const ticket = ticketByKey.get(workItemKey.toUpperCase());
    if (ticket === undefined) continue;
    for (const match of entry.body.matchAll(PR_BODY_MENTION)) {
      push(ticketRefOf(ticket), match[1]!, Number(match[2]));
    }
  }

  return blockers;
}
