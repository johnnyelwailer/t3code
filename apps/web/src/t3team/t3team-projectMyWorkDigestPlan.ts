import { getProjectTicketKanbanLane } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectTicket } from "~/t3team/t3team-types";

export type DigestClaim = {
  readonly threadId: string;
  readonly threadTitle: string;
  readonly ticketId: string;
  readonly agent: string;
  readonly lastActivityAt: string;
  /** Where the claiming thread lives, so the dot can link to it. */
  readonly threadUrl?: string;
};

export type DigestDecision = {
  readonly id: string;
  readonly ticketId: string;
  readonly threadId: string;
  readonly question: string;
  readonly requiredRole: string;
  readonly askedAt: string;
};

/**
 * A PR reviewer as the digest sees them: a person chip (name, avatar) plus the verdict they
 * have left on the PR, if any. `login` is the GitHub handle the chip links to.
 */
export type DigestReviewer = {
  readonly name: string;
  readonly login: string;
  readonly decision?: "approved" | "changes-requested";
};

export type DigestChangeRequest = {
  readonly id: string;
  readonly ticketId: string;
  readonly repo: string;
  readonly number: number;
  readonly state:
    | "draft"
    | "open"
    | "needs-you"
    | "changes-requested"
    | "ci-failing"
    | "approved"
    | "merged";
  readonly reviewers: readonly DigestReviewer[];
  /** Unhandled review comments since the viewer's last visit. */
  readonly unhandledComments?: number;
  readonly updatedAt: string;
};

/** A PR that gates a ticket: the ticket's action line reads "blocked by enabler PR repo#n". */
export type DigestBlocker = {
  readonly ticketId: string;
  readonly repo: string;
  readonly number: number;
};

/**
 * One concrete next step on a digest item: either a link (open thread / PR / CI) or a recipe
 * starter (launches a workflow, e.g. "handle review comments"). Items carry 0..n; the first
 * is primary and always visible, the rest reveal on row hover.
 */
export type DigestItemAction = {
  readonly label: string;
  readonly href?: string;
  readonly recipe?: string;
};

export type DigestTransition = {
  readonly ticketId: string;
  readonly from: string;
  readonly to: string;
  readonly at: string;
};

export type DigestSprint = {
  readonly name: string;
  readonly goal: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
};

export type DigestProject = { readonly id: string; readonly name: string; readonly url?: string };

export type DigestGraph = {
  readonly scope: "project" | "all";
  readonly projects: readonly DigestProject[];
  readonly viewer: { readonly name: string; readonly role: string; readonly lastVisitAt: string };
  readonly sprint?: DigestSprint;
  readonly tickets: readonly ProjectTicket[];
  readonly claims: readonly DigestClaim[];
  readonly decisions: readonly DigestDecision[];
  readonly changeRequests: readonly DigestChangeRequest[];
  readonly transitions: readonly DigestTransition[];
  readonly blockers: readonly DigestBlocker[];
};

export type DigestFacet = "decision" | "claim" | "changeRequest" | "moved" | "stalled";

export type DigestItemRef = { readonly ticketId: string; readonly why?: string };

export type DigestPlacement = "side" | "main" | "footer";

export type DigestSection = {
  readonly id: string;
  readonly kind: "items";
  readonly placement: DigestPlacement;
  readonly heading: string;
  readonly hint?: string;
  readonly items: readonly DigestItemRef[];
};

export type DigestPlan = {
  readonly producer: "heuristic" | "agent";
  readonly producedAt: string;
  readonly sections: readonly DigestSection[];
};

export const DIGEST_STALLED_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export function isDigestTicketDone(ticket: ProjectTicket): boolean {
  return getProjectTicketKanbanLane(ticket.status) === "done";
}

function isMine(ticket: ProjectTicket, graph: DigestGraph): boolean {
  return ticket.assignee === graph.viewer.name;
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

type Bucket = {
  readonly id: string;
  readonly heading: string;
  readonly placement: DigestPlacement;
  readonly accepts: (facets: readonly DigestFacet[]) => boolean;
};

const BUCKETS: readonly Bucket[] = [
  {
    id: "needs-you",
    heading: "Needs you",
    placement: "side",
    accepts: (f) => f.includes("decision"),
  },
  {
    id: "review",
    heading: "Waiting for your review",
    placement: "side",
    accepts: (f) => f.includes("changeRequest"),
  },
  {
    id: "order",
    heading: "Priority",
    placement: "main",
    accepts: (f) => f.includes("claim") || f.includes("moved"),
  },
  {
    id: "stalled",
    heading: "Stalled agents",
    placement: "footer",
    accepts: (f) => f.includes("stalled"),
  },
  { id: "rest", heading: "Parked", placement: "footer", accepts: () => true },
];

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
  const sections = BUCKETS.map((bucket) => ({
    id: bucket.id,
    kind: "items" as const,
    placement: bucket.placement,
    heading: bucket.heading,
    items: candidates
      .filter((ticket) => !placed.has(ticket.id))
      .filter((ticket) => bucket.accepts(digestFacetsFor(graph, ticket.id, nowMs)))
      .map((ticket) => {
        placed.add(ticket.id);
        return { ticketId: ticket.id };
      }),
  })).filter((section) => section.items.length > 0);
  return { producer: "heuristic", producedAt: new Date(nowMs).toISOString(), sections };
}

export type ResolvedDigestPlan = DigestPlan & {
  readonly droppedTicketIds: readonly string[];
  readonly newSinceTicketIds: readonly string[];
};

export function resolveDigestPlan(
  plan: DigestPlan,
  graph: DigestGraph,
  nowMs: number,
): ResolvedDigestPlan {
  const live = new Set(graph.tickets.filter((t) => !isDigestTicketDone(t)).map((t) => t.id));
  const referenced = new Set(plan.sections.flatMap((s) => s.items.map((i) => i.ticketId)));
  const droppedTicketIds = [...referenced].filter((id) => !live.has(id));
  const sections = plan.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => live.has(item.ticketId)),
    }))
    .filter((section) => section.items.length > 0);
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
