/**
 * The digest lens body for the per-project My Work view: reads the server-aggregated
 * `DigestGraph` for this project, derives the heuristic plan from it, and renders
 * `ProjectMyWorkDigestView`. Extracted from `ProjectMyWorkContent` so that file stays inside
 * the t3team additive line cap.
 */
import { useMemo } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { JiraSessionExpiredPanel } from "~/t3team/components/t3team-JiraSessionExpiredPanel";
import { JiraSignInPanel } from "~/t3team/components/t3team-JiraSignInPanel";
import { useMyWorkDigestGraph } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraph";
import { ProjectMyWorkDigestErrorState } from "~/t3team/t3team-ProjectMyWorkDigestErrorState";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import { useT3TeamBetaFlags } from "~/t3team/t3team-betaFlags";
import { ProjectMyWorkLoadingState } from "~/t3team/t3team-projectMyWorkContentState";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import { filterDigestTickets } from "~/t3team/t3team-projectMyWork";
import type { DigestFilterState } from "~/t3team/t3team-projectMyWorkDigestTypes";
import type { ProjectShellProject } from "@t3tools/project-context";

// TODO(digest-nav): rows navigate to the ticket URL today; thread an in-app onOpenTicket through
// ProjectMyWorkDigestView -> DigestStoryGroup/DigestRow once the Storybook cut settles.
export function ProjectMyWorkDigestContent({
  project,
  onOpenTicket,
  digestFilters,
}: {
  project: ProjectShellProject;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  digestFilters?: DigestFilterState | undefined;
}) {
  const { flags } = useT3TeamBetaFlags();
  // Beta flag: rows open the ticket in-app, or fall back to the ticket URL.
  const openTicketInApp =
    flags.digestRowNavigation === "in-app"
      ? (ticketId: string) => onOpenTicket(project.id, ticketId)
      : undefined;
  const projects = useMemo(() => [project], [project]);
  const { graph, status, error, viewerUnresolved, sessionExpired, reload } = useMyWorkDigestGraph({
    projects,
    scope: "project",
  });
  // The My Work filter bar (search, status category, hidden types, priority, status) shapes the
  // digest the same way it shapes the legacy lenses: keep only the tickets that match, and drop
  // the agent activity that belongs to tickets the filter hid, so no lane orphans a filtered row.
  const effectiveGraph = useMemo(() => {
    if (!graph || !digestFilters) return graph;
    const tickets = filterDigestTickets({
      tickets: graph.tickets,
      query: digestFilters.query,
      statusCategory: digestFilters.statusCategory,
      excludedTypeKeys: digestFilters.excludedTypeKeys,
      selectedPriority: digestFilters.selectedPriority,
      selectedStatus: digestFilters.selectedStatus,
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
  }, [graph, digestFilters]);
  // Minute-granular clock shared with the rest of the app: stable within a render, re-plans on tick.
  // useNowMinute yields UTC wall-clock text without a zone suffix; parse it as UTC.
  const nowMs = Date.parse(`${useNowMinute()}Z`);
  const plan = useMemo(() => {
    if (!effectiveGraph) {
      return null;
    }
    return resolveDigestPlan(
      buildHeuristicDigestPlan(effectiveGraph, nowMs),
      effectiveGraph,
      nowMs,
    );
  }, [effectiveGraph, nowMs]);

  if (status === "loading" && !graph) {
    return <ProjectMyWorkLoadingState />;
  }
  if (sessionExpired) {
    return <JiraSessionExpiredPanel onSignedIn={reload} />;
  }
  if (status === "error") {
    return <ProjectMyWorkDigestErrorState error={error} onRetry={reload} />;
  }
  if (viewerUnresolved && (graph?.tickets.length ?? 0) === 0) {
    return <JiraSignInPanel heading="Sign in to Jira to load your work." onSignedIn={reload} />;
  }
  if (!effectiveGraph || !plan) {
    return (
      <T3SurfacePanel tone="dashed" className="px-4 py-8 text-sm text-muted-foreground">
        Nothing needs you
      </T3SurfacePanel>
    );
  }
  if (effectiveGraph.tickets.length === 0 && graph !== null && effectiveGraph !== graph) {
    // The graph has tickets, but the active filters hid every one of them: say so, instead of
    // implying there is nothing on the board at all.
    return (
      <T3SurfacePanel tone="dashed" className="px-4 py-8 text-sm text-muted-foreground">
        No items match the active filters.
      </T3SurfacePanel>
    );
  }
  if (digestFilters && plan.sections.length === 0 && effectiveGraph.tickets.length > 0) {
    // The filters kept tickets the digest lens cannot place in a lane (e.g. status "done": the
    // digest shows active work, not finished items): attribute the empty state to the filters,
    // not to the board.
    return (
      <T3SurfacePanel tone="dashed" className="px-4 py-8 text-sm text-muted-foreground">
        No items match the active filters.
      </T3SurfacePanel>
    );
  }
  return (
    <ProjectMyWorkDigestView
      plan={plan}
      graph={effectiveGraph}
      nowMs={nowMs}
      burndownVariant={flags.digestBurndownVariant}
      onOpenTicket={openTicketInApp}
    />
  );
}
