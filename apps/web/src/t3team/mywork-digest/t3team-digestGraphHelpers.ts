/** Pure helpers of the digest graph mapper (`t3team-digestGraphMappers.ts`). */

import type { MyWorkDigestPayload } from "~/t3team/backend/t3team-myworkDigestBackendApi";
import type { DigestReviewRequest } from "~/t3team/t3team-projectMyWorkDigestTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";

export type TicketIndex = Map<string, string>;

export function buildTicketIndex(
  tickets: readonly ProjectTicket[],
  ids: ReadonlyArray<string>,
): TicketIndex {
  const index: TicketIndex = new Map();
  tickets.forEach((ticket, position) => {
    const refId = ids[position];
    if (refId !== undefined) index.set(refId.toUpperCase(), ticket.id);
    const key = ticket.ref.displayId.toUpperCase();
    if (key !== "") index.set(key, ticket.id);
  });
  return index;
}

/** Split a Jira sprint goal (one string, possibly bulleted) into goal lines. */
export function digestSprintGoals(goal: string | undefined): readonly string[] {
  if (goal === undefined) return [];
  return goal
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*\s]+/, "").trim())
    .filter((line) => line !== "");
}

/** "Unhandled" = unresolved AND newer than the last visit; untimed threads count always. */
export function countUnhandledThreads(
  threads: ReadonlyArray<{ readonly lastCommentAt?: string }>,
  lastVisitMs: number,
): number {
  return threads.reduce((count, thread) => {
    const at = thread.lastCommentAt !== undefined ? Date.parse(thread.lastCommentAt) : NaN;
    return Number.isNaN(at) ? count + 1 : at > lastVisitMs ? count + 1 : count;
  }, 0);
}

/** The oldest project sync is the honest one: any project behind it may be stale. */
export function oldestJiraSync(
  projects: ReadonlyArray<{ readonly jiraSyncedAt?: string }>,
): string | undefined {
  return projects
    .flatMap((data) => (data.jiraSyncedAt !== undefined ? [data.jiraSyncedAt] : []))
    .toSorted()[0];
}

export type DigestTicketRefLike = { readonly issueId?: string; readonly issueKey?: string };

/** A server ticket ref → the app ticket id, by Jira id first, then key; "" when unknown. */
export function resolveIndexedTicketId(
  index: TicketIndex | undefined,
  ref: DigestTicketRefLike,
): string {
  if (index === undefined) return "";
  const byId = ref.issueId !== undefined ? index.get(ref.issueId.toUpperCase()) : undefined;
  if (byId !== undefined) return byId;
  const byKey = ref.issueKey !== undefined ? index.get(ref.issueKey.toUpperCase()) : undefined;
  return byKey ?? "";
}

/**
 * Other people's PRs waiting for the viewer's review, once each across projects: the review lane's
 * rows. A PR the viewer wrote is theirs to move and stays a chip on its ticket instead.
 */
export function digestReviewRequests(
  projects: MyWorkDigestPayload["projects"],
  resolveTicketId: (position: number, ref: DigestTicketRefLike) => string,
  projectIdAt: (position: number) => string,
): DigestReviewRequest[] {
  const byId = new Map<string, DigestReviewRequest>();
  projects.forEach((data, position) => {
    for (const pr of data.changeRequests) {
      if (pr.viewerReviewRequested !== true || pr.viewerAuthored === true || byId.has(pr.id))
        continue;
      const ticketId =
        pr.workItemKey !== undefined ? resolveTicketId(position, { issueKey: pr.workItemKey }) : "";
      byId.set(pr.id, {
        id: pr.id,
        projectId: projectIdAt(position),
        ...(pr.host !== undefined ? { host: pr.host } : {}),
        repo: pr.repo,
        number: pr.number,
        title: pr.title ?? `${pr.repo}#${pr.number}`,
        updatedAt: pr.updatedAt,
        ...(pr.workItemKey !== undefined ? { workItemKey: pr.workItemKey } : {}),
        ...(ticketId !== "" ? { ticketId } : {}),
      });
    }
  });
  return [...byId.values()].toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
