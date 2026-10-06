import { getProjectTicketKanbanLane } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";

export type {
  DigestClaim,
  DigestDecision,
  DigestReviewer,
  DigestChangeRequest,
  DigestReviewRequest,
  DigestDependency,
  DigestBlocker,
  DigestItemAction,
  DigestTransition,
  DigestSprint,
  DigestProject,
  DigestGraph,
  DigestFacet,
  DigestItemRef,
  DigestPlacement,
  DigestSection,
  DigestPlan,
  ResolvedDigestPlan,
} from "./t3team-projectMyWorkDigestTypes";

import type {
  DigestFacet,
  DigestGraph,
  DigestPlan,
  DigestSection,
  ResolvedDigestPlan,
} from "./t3team-projectMyWorkDigestTypes";

export const DIGEST_STALLED_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export function isDigestTicketDone(ticket: ProjectTicket): boolean {
  return getProjectTicketKanbanLane(ticket.status) === "done";
}

function isMine(ticket: ProjectTicket, graph: DigestGraph): boolean {
  const assignee = ticket.assignee?.trim().toLowerCase();
  const viewer = graph.viewer.name?.trim().toLowerCase();
  return (
    assignee !== undefined &&
    assignee !== "" &&
    viewer !== undefined &&
    viewer !== "" &&
    assignee === viewer
  );
}

function latestClaimActivity(graph: DigestGraph, ticketId: string): number | null {
  const times = graph.claims
    .filter((claim) => claim.ticketId === ticketId)
    .map((claim) => Date.parse(claim.lastActivityAt));
  return times.length === 0 ? null : Math.max(...times);
}

export function digestFacetsFor(
  graph: DigestGraph,
  ticketId: string,
  nowMs: number,
): readonly DigestFacet[] {
  const facets: DigestFacet[] = [];
  if (graph.decisions.some((d) => d.ticketId === ticketId)) facets.push("decision");
  if (graph.changeRequests.some((r) => r.ticketId === ticketId && r.state === "needs-you")) {
    facets.push("changeRequest");
  }
  const claimAt = latestClaimActivity(graph, ticketId);
  if (claimAt !== null)
    facets.push(nowMs - claimAt > DIGEST_STALLED_AFTER_MS ? "stalled" : "claim");
  const lastVisit = Date.parse(graph.viewer.lastVisitAt);
  if (graph.transitions.some((t) => t.ticketId === ticketId && Date.parse(t.at) > lastVisit)) {
    facets.push("moved");
  }
  return facets;
}

import { DIGEST_BUCKETS } from "./t3team-projectMyWorkDigestBuckets";

/** Reviews the viewer owes, ahead of their own work: someone is blocked on each of them. */
function reviewSections(graph: DigestGraph): DigestSection[] {
  const reviewIds = (graph.reviewRequests ?? []).map((review) => review.id);
  if (reviewIds.length === 0) return [];
  return [
    {
      id: "to-review",
      kind: "reviews",
      widget: "my-work.reviews",
      placement: "side",
      heading: "To review",
      hint: "other people's pull requests waiting for you",
      items: [],
      reviewIds,
    },
  ];
}

function byRecency(left: ProjectTicket, right: ProjectTicket): number {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

export function buildHeuristicDigestPlan(
  graph: DigestGraph,
  nowMs: number,
  onlyTicketIds?: ReadonlySet<string>,
): DigestPlan {
  const candidates = graph.tickets
    .filter((ticket) => isMine(ticket, graph) && !isDigestTicketDone(ticket))
    .filter((ticket) => onlyTicketIds === undefined || onlyTicketIds.has(ticket.id))
    .toSorted(byRecency);
  const placed = new Set<string>();
  const sections = DIGEST_BUCKETS.map((bucket) => ({
    id: bucket.id,
    kind: "items" as const,
    widget: "my-work.tickets",
    placement: bucket.placement,
    heading: bucket.heading,
    ...(bucket.hint !== undefined ? { hint: bucket.hint } : {}),
    items: candidates
      .filter((ticket) => !placed.has(ticket.id))
      .filter((ticket) => bucket.accepts(digestFacetsFor(graph, ticket.id, nowMs), ticket, nowMs))
      .map((ticket) => {
        placed.add(ticket.id);
        return bucket.why
          ? { ticketId: ticket.id, why: bucket.why(ticket, nowMs) }
          : { ticketId: ticket.id };
      }),
  })).filter((section) => section.items.length > 0);
  return {
    producer: "heuristic",
    producedAt: new Date(nowMs).toISOString(),
    sections: onlyTicketIds === undefined ? [...reviewSections(graph), ...sections] : sections,
  };
}

export function resolveDigestPlan(
  plan: DigestPlan,
  graph: DigestGraph,
  nowMs: number,
): ResolvedDigestPlan {
  const live = new Set(graph.tickets.filter((t) => !isDigestTicketDone(t)).map((t) => t.id));
  const referenced = new Set(plan.sections.flatMap((s) => s.items.map((i) => i.ticketId)));
  const droppedTicketIds = [...referenced].filter((id) => !live.has(id));
  const reviewIds = new Set((graph.reviewRequests ?? []).map((review) => review.id));
  const sections = plan.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => live.has(item.ticketId)),
      ...(section.reviewIds !== undefined
        ? { reviewIds: section.reviewIds.filter((id) => reviewIds.has(id)) }
        : {}),
    }))
    .filter((section) =>
      section.kind === "reviews" ? (section.reviewIds?.length ?? 0) > 0 : section.items.length > 0,
    );
  const unseen = new Set(
    graph.tickets
      .filter((t) => live.has(t.id) && isMine(t, graph) && !referenced.has(t.id))
      .map((t) => t.id),
  );
  const trailing = buildHeuristicDigestPlan(graph, nowMs, unseen).sections.map((section) => ({
    ...section,
    id: `new-${section.id}`,
    heading: `New · ${section.heading}`,
  }));
  return {
    ...plan,
    sections: [...sections, ...trailing],
    droppedTicketIds,
    newSinceTicketIds: [...unseen],
  };
}
