/**
 * The My Work filter bar applied to a digest graph.
 *
 * It shapes the digest the same way it shapes the legacy lenses: keep only the tickets that match,
 * and drop the agent activity belonging to tickets the filter hid, so no lane orphans a filtered
 * row. Returns the SAME graph object when nothing is filtered out — callers compare identity to
 * tell "the filters hid everything" from "the board is empty".
 */
import { filterDigestTickets } from "~/t3team/t3team-projectMyWork";
import type { DigestFilterState } from "~/t3team/t3team-projectMyWorkDigestTypes";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

export function applyDigestFilters(
  graph: DigestGraph | null,
  filters: DigestFilterState | undefined,
): DigestGraph | null {
  if (!graph || !filters) return graph;
  const tickets = filterDigestTickets({
    tickets: graph.tickets,
    query: filters.query,
    statusCategory: filters.statusCategory,
    excludedTypeKeys: filters.excludedTypeKeys,
    selectedPriority: filters.selectedPriority,
    selectedStatus: filters.selectedStatus,
  });
  if (tickets.length === graph.tickets.length) return graph;
  const kept = new Set(tickets.map((ticket) => ticket.id));
  return {
    ...graph,
    tickets,
    claims: graph.claims.filter((claim) => kept.has(claim.ticketId)),
    decisions: graph.decisions.filter((decision) => kept.has(decision.ticketId)),
    changeRequests: graph.changeRequests.filter((request) => kept.has(request.ticketId)),
    blockers: graph.blockers.filter((blocker) => kept.has(blocker.ticketId)),
    transitions: graph.transitions.filter((transition) => kept.has(transition.ticketId)),
  };
}
