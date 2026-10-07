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
import { useDigestArrangementReset } from "~/t3team/mywork-digest/t3team-useDigestArrangementReset";
import { applyDigestFilters } from "~/t3team/mywork-digest/t3team-digestGraphFilter";
import { closeDigestPullRequest, openDigestTicket } from "~/t3team/t3team-digestPrAsideStore";
import { ProjectMyWorkDigestErrorState } from "~/t3team/t3team-ProjectMyWorkDigestErrorState";
import { ProjectMyWorkDigestRetryState } from "~/t3team/t3team-ProjectMyWorkDigestRetryState";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import { useT3TeamBetaFlags } from "~/t3team/t3team-betaFlags";
import { MyWorkLoadingAnimation } from "~/t3team/t3team-MyWorkLoadingAnimation";
import { resolveMyWorkDigestRenderState } from "~/t3team/t3team-myWorkDigestRenderState";
import { buildDigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { hasActiveDigestFilters } from "~/t3team/t3team-projectMyWork";
import type { DigestFilterState } from "~/t3team/t3team-projectMyWorkDigestTypes";
import type { ProjectShellProject } from "@t3tools/project-context";

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
  // A row opens its ticket beside the digest (the dashboard aside, a drawer on narrow screens);
  // the full ticket page is one click from there.
  const openTicketInApp = (ticketId: string) =>
    openDigestTicket({
      projectId: project.id,
      ticketId,
      // The page replaces the aside: coming back to the digest shows the default aside again.
      openFullPage: (shownTicketId) => {
        closeDigestPullRequest();
        onOpenTicket(project.id, shownTicketId);
      },
    });
  const projects = useMemo(() => [project], [project]);
  const { graph, status, error, viewerUnresolved, sessionExpired, updatedAt, reload, freshness, refreshing } =
    useMyWorkDigestGraph({ projects, scope: "project" });
  const resetArrangement = useDigestArrangementReset({ scope: "project", projects, reload });
  const effectiveGraph = useMemo(
    () => applyDigestFilters(graph, digestFilters),
    [graph, digestFilters],
  );
  // Minute-granular clock shared with the rest of the app: stable within a render, re-plans on tick.
  // useNowMinute yields UTC wall-clock text without a zone suffix; parse it as UTC.
  const nowMs = Date.parse(`${useNowMinute()}Z`);
  const plan = useMemo(() => {
    if (!effectiveGraph) {
      return null;
    }
    return buildDigestPlan(effectiveGraph, nowMs);
  }, [effectiveGraph, nowMs]);

  // The project is given, so its scope is known from the first render: only the round's own
  // freshness decides whether an empty answer is "nothing" or "not yet".
  const renderState = resolveMyWorkDigestRenderState({
    status,
    freshness,
    sessionExpired,
    viewerUnresolved,
    hasGraph: effectiveGraph !== null,
    ticketCount: graph?.tickets.length ?? 0,
  });
  // A failed fetch (backend still starting, timeout) is not terminal: the poller retries with
  // backoff and this recovers on its own, so it renders as "retrying" — never a raw error.
  if (renderState === "retrying") {
    return <ProjectMyWorkDigestRetryState />;
  }
  if (renderState === "loading") {
    return <MyWorkLoadingAnimation />;
  }
  if (renderState === "session-expired") {
    return <JiraSessionExpiredPanel onSignedIn={reload} />;
  }
  if (renderState === "error") {
    return <ProjectMyWorkDigestErrorState error={error} onRetry={reload} />;
  }
  if (renderState === "sign-in") {
    return <JiraSignInPanel heading="Sign in to Jira to load your work." onSignedIn={reload} />;
  }
  if (renderState === "empty" || !effectiveGraph || !plan) {
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
  if (
    digestFilters &&
    hasActiveDigestFilters(digestFilters) &&
    plan.sections.length === 0 &&
    effectiveGraph.tickets.length > 0
  ) {
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
      onResetArrangement={resetArrangement}
      refreshing={refreshing}
      emptyStateAllowed={freshness === "fresh"}
      {...(updatedAt !== undefined ? { updatedAtMs: updatedAt } : {})}
    />
  );
}
