/**
 * Pure aggregation for the My Work Digest graph: joins the per-project source
 * sets (mirror tickets, thread claims, pending workflow decisions, cached PR
 * rows, status transitions, sprints) into `T3TeamMyWorkDigestPayload`.
 *
 * Deliberately DB-free and Date-free where it can be: the SQL layer hands in
 * ready-to-join arrays and this module only matches, maps, and orders — which
 * is what the 500-ticket unit test exercises.
 */

import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import type {
  T3TeamDigestChangeRequest,
  T3TeamDigestProjectData,
  T3TeamDigestSprint,
  T3TeamDigestTicketRef,
  T3TeamMyWorkDigestPayload,
  T3TeamMyWorkDigestScope,
  T3TeamDigestProjectSource,
} from "./t3team-myworkDigestTypes.ts";

/** Resolve a raw thread ticket id against a project's mirror refs (id or key). */
export function resolveDigestTicketRef(
  rawTicketId: string | undefined,
  tickets: ReadonlyArray<BacklogResourceRef>,
): T3TeamDigestTicketRef {
  if (rawTicketId === undefined || rawTicketId.trim() === "") return {};
  const normalized = rawTicketId.trim().toUpperCase();
  for (const ticket of tickets) {
    if (
      String(ticket.id).toUpperCase() === normalized ||
      (ticket.displayId ?? "").toUpperCase() === normalized
    ) {
      return {
        issueId: String(ticket.id),
        ...(ticket.displayId !== undefined ? { issueKey: ticket.displayId } : {}),
      };
    }
  }
  // The thread names a ticket we have not mirrored yet: keep the raw pointer
  // so the claim still lands; the client just cannot join it to a row.
  return normalized.includes("-") ? { issueKey: normalized } : { issueId: rawTicketId.trim() };
}

/** Jira issue key: an uppercase prefix, a dash, digits (IES-13068, NXAI-480). */
const WORK_ITEM_KEY = /(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9]+-\d+)/;

/**
 * Pull a candidate ticket key out of a PR title or head branch, exactly the
 * way `extractWorkItemKey` does it on the client. Returns undefined when
 * nothing in this project's key set matches, so a "FOO-1" in some other
 * project's vocabulary never lands on the wrong ticket.
 */
export function matchDigestWorkItemKey(
  title: string,
  headBranch: string,
  ticketKeys: ReadonlySet<string>,
): string | undefined {
  for (const source of [title, headBranch]) {
    const match = source.match(WORK_ITEM_KEY);
    const key = match?.[1]?.toUpperCase();
    if (key !== undefined && ticketKeys.has(key)) return key;
  }
  return undefined;
}

/**
 * The digest chip state, derived from what a cached listing row already says
 * about this viewer. Precedence when several apply (top wins): merged >
 * ci-failing > changes-requested > needs-you > approved > draft > open.
 * Plain closed (unmerged) rows are dropped upstream — nothing in the digest
 * vocabulary wears "closed".
 */
export function digestChangeRequestStateFromPr(entry: {
  readonly state: string;
  readonly isDraft: boolean;
  readonly viewerReviewRequested: boolean;
  readonly reviewDecision?: string;
  readonly checksState?: string;
}): T3TeamDigestChangeRequest["state"] {
  if (entry.state === "merged") return "merged";
  if (entry.checksState === "failing") return "ci-failing";
  if (entry.reviewDecision === "changes-requested") return "changes-requested";
  if (entry.viewerReviewRequested) return "needs-you";
  if (entry.reviewDecision === "approved") return "approved";
  if (entry.isDraft) return "draft";
  return "open";
}

export function assembleMyWorkDigestChangeRequests(
  source: Pick<T3TeamDigestProjectSource, "tickets" | "prEntries">,
): T3TeamDigestChangeRequest[] {
  const ticketKeys = new Set(
    source.tickets
      .map((ticket) => (ticket.displayId ?? "").toUpperCase())
      .filter((key) => key !== ""),
  );
  const changeRequests: T3TeamDigestChangeRequest[] = [];
  for (const entry of source.prEntries) {
    // Open and merged PRs wear a digest state; plain closed ones never did.
    if (entry.state !== "open" && entry.state !== "merged") continue;
    const workItemKey = matchDigestWorkItemKey(entry.title, entry.headBranch, ticketKeys);
    changeRequests.push({
      id: `${entry.host}:${entry.repository}#${entry.number}`,
      repo: entry.repository,
      number: entry.number,
      state: digestChangeRequestStateFromPr(entry),
      updatedAt: entry.updatedAt,
      ...(workItemKey !== undefined ? { workItemKey } : {}),
    });
  }
  return changeRequests;
}

/** The sprint the digest header wears: the active one, else the first known. */
export function pickDigestSprint(
  sprints: T3TeamDigestProjectSource["sprints"],
): T3TeamDigestSprint | undefined {
  if (sprints.length === 0) return undefined;
  const active = sprints.find((sprint) => sprint.state?.toLowerCase() === "active");
  const chosen = active ?? sprints[0];
  if (chosen === undefined) return undefined;
  return {
    name: chosen.name,
    ...(chosen.goal !== undefined && chosen.goal.trim() !== "" ? { goal: chosen.goal } : {}),
    ...(chosen.startDate !== undefined ? { startDate: chosen.startDate } : {}),
    ...(chosen.endDate !== undefined ? { endDate: chosen.endDate } : {}),
  };
}

function compareTicketsByUpdatedAtDesc(
  left: T3TeamDigestProjectSource["tickets"][number],
  right: T3TeamDigestProjectSource["tickets"][number],
): number {
  const leftAt = left.updatedAt ?? "";
  const rightAt = right.updatedAt ?? "";
  if (leftAt !== rightAt) return leftAt < rightAt ? 1 : -1;
  return String(left.id) < String(right.id) ? -1 : 1;
}

/** Joins one project's sources into its payload section. */
export function assembleMyWorkDigestProjectData(
  source: T3TeamDigestProjectSource,
): T3TeamDigestProjectData {
  const tickets = [...source.tickets].toSorted(compareTicketsByUpdatedAtDesc);
  const sprint = pickDigestSprint(source.sprints);
  const name = source.input.name?.trim();
  return {
    project: {
      id: source.input.externalProjectId,
      name: name !== undefined && name !== "" ? name : source.input.externalProjectId,
    },
    tickets,
    claims: source.claims,
    decisions: source.decisions,
    changeRequests: assembleMyWorkDigestChangeRequests(source),
    transitions: source.transitions,
    ...(sprint !== undefined ? { sprint } : {}),
    ...(source.changeRequestNote !== undefined
      ? { changeRequestNote: source.changeRequestNote }
      : {}),
  };
}

/** The whole digest in one pass: scope + one section per project entry. */
export function assembleMyWorkDigestPayload(input: {
  readonly scope: T3TeamMyWorkDigestScope;
  readonly sources: ReadonlyArray<T3TeamDigestProjectSource>;
}): T3TeamMyWorkDigestPayload {
  return {
    scope: input.scope,
    projects: input.sources.map(assembleMyWorkDigestProjectData),
  };
}
