import { getProjectTicketKanbanLane } from "~/t3team/t3team-projectTicketStatus";
import { normalizeProjectTicketStatus } from "~/t3team/t3team-projectTicketStatusKeywords";
import { digestTitleWithoutKey } from "~/t3team/t3team-projectMyWorkDigestFacts";
import type {
  DigestYesterday,
  DigestYesterdayMerged,
  DigestYesterdayMoved,
} from "~/t3team/t3team-projectMyWorkDigestTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";

/** One work item of the recap: the ticket, where it ended up, and the PRs merged for it. */
export type DigestYesterdayWorkItem = {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  /** Present only for a ticket the digest holds — the row then opens it in the app. */
  readonly ticketId?: string;
  /** The last status move of the day; absent when the ticket only had PRs merged. */
  readonly outcome?: { readonly from?: string; readonly to: string };
  readonly merged: readonly DigestYesterdayMerged[];
  readonly lastAtMs: number;
};

export type DigestYesterdaySummary = {
  readonly merged: number;
  readonly done: number;
  /** Moved to a review status: ready for someone to review. */
  readonly review: number;
  /** Moved to a test/QA status: past review, merged at least. */
  readonly test: number;
  readonly moved: number;
};

export type DigestYesterdayRecap = {
  readonly items: readonly DigestYesterdayWorkItem[];
  /** Merged PRs that name no work item, one line each. */
  readonly loosePrs: readonly DigestYesterdayMerged[];
  readonly summary: DigestYesterdaySummary;
};

type Draft = {
  key: string;
  title: string;
  ticketId?: string;
  move?: DigestYesterdayMoved & { readonly to: string };
  merged: DigestYesterdayMerged[];
};

const atMs = (iso: string) => Date.parse(iso) || 0;

// The kanban's review lane holds both "Code Review" and "In Test"; the recap tells them apart,
// because a ticket in test is past review.
function outcomeLane(status: string) {
  const lane = getProjectTicketKanbanLane(status);
  if (lane !== "review") return lane;
  return normalizeProjectTicketStatus(status).includes("review") ? "review" : "test";
}

/**
 * Yesterday, grouped by work item instead of by event: one entry per ticket with its last status
 * move and its merged PRs. A move without a target status (Jira merely updated the ticket) says
 * nothing, so a ticket with only such updates is left out.
 */
export function digestYesterdayRecap(
  yesterday: DigestYesterday | undefined,
  ticketsById: ReadonlyMap<string, ProjectTicket>,
): DigestYesterdayRecap {
  const byKey = new Map(
    [...ticketsById.values()].map((ticket) => [ticket.ref.displayId.toUpperCase(), ticket]),
  );
  const drafts = new Map<string, Draft>();
  const draftFor = (ticket: ProjectTicket | undefined, key: string, title: string): Draft => {
    const id = ticket?.id ?? `key:${key.toUpperCase()}`;
    const existing = drafts.get(id);
    if (existing) return existing;
    const draft: Draft = ticket
      ? { key: ticket.ref.displayId, title: ticket.ref.title, ticketId: ticket.id, merged: [] }
      : { key, title, merged: [] };
    drafts.set(id, draft);
    return draft;
  };
  for (const move of yesterday?.moved ?? []) {
    const ticket = ticketsById.get(move.ticketId);
    if (!ticket || move.to === undefined) continue;
    const draft = draftFor(ticket, ticket.ref.displayId, ticket.ref.title);
    if (!draft.move || atMs(move.at) >= atMs(draft.move.at)) draft.move = { ...move, to: move.to };
  }
  const loosePrs: DigestYesterdayMerged[] = [];
  for (const pr of yesterday?.merged ?? []) {
    const ticket =
      (pr.ticketId !== undefined ? ticketsById.get(pr.ticketId) : undefined) ??
      (pr.workItemKey !== undefined ? byKey.get(pr.workItemKey.toUpperCase()) : undefined);
    if (!ticket && pr.workItemKey === undefined) {
      loosePrs.push(pr);
      continue;
    }
    const key = ticket?.ref.displayId ?? pr.workItemKey ?? "";
    draftFor(ticket, key, digestTitleWithoutKey(pr.title, key)).merged.push(pr);
  }
  const items = [...drafts].map(([id, draft]) => {
    const times = [...draft.merged.map((pr) => atMs(pr.mergedAt)), atMs(draft.move?.at ?? "")];
    return {
      id,
      key: draft.key,
      title: draft.title,
      ...(draft.ticketId !== undefined ? { ticketId: draft.ticketId } : {}),
      ...(draft.move
        ? {
            outcome: {
              ...(draft.move.from !== undefined ? { from: draft.move.from } : {}),
              to: draft.move.to,
            },
          }
        : {}),
      merged: draft.merged.toSorted((a, b) => atMs(b.mergedAt) - atMs(a.mergedAt)),
      lastAtMs: Math.max(...times),
    };
  });
  const lanes = items.flatMap((item) => (item.outcome ? [outcomeLane(item.outcome.to)] : []));
  return {
    items: items.toSorted((a, b) => b.lastAtMs - a.lastAtMs),
    loosePrs: loosePrs.toSorted((a, b) => atMs(b.mergedAt) - atMs(a.mergedAt)),
    summary: {
      merged: yesterday?.merged.length ?? 0,
      done: lanes.filter((lane) => lane === "done").length,
      review: lanes.filter((lane) => lane === "review").length,
      test: lanes.filter((lane) => lane === "test").length,
      moved: lanes.length,
    },
  };
}

/** "6 PRs merged · 3 done · 1 to review · 1 to test"; other moves count only when nothing else did. */
export function digestYesterdaySummaryText(summary: DigestYesterdaySummary): string {
  const parts = [
    summary.merged > 0 ? `${summary.merged} PR${summary.merged === 1 ? "" : "s"} merged` : null,
    summary.done > 0 ? `${summary.done} done` : null,
    summary.review > 0 ? `${summary.review} to review` : null,
    summary.test > 0 ? `${summary.test} to test` : null,
  ].filter((part) => part !== null);
  if (parts.length > 0) return parts.join(" · ");
  return `${summary.moved} ticket${summary.moved === 1 ? "" : "s"} moved`;
}

/** Before noon, local time: the recap is what the viewer looks for first thing. */
export function isDigestMorning(nowMs: number): boolean {
  return new Date(nowMs).getHours() < 12;
}
