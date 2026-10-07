/**
 * The digest lens body for "my work across every bound project".
 *
 * Split out of `AllProjectsMyWorkView` so that file stays inside the t3team line cap. The view
 * only renders it once the scoped project list is KNOWN: a digest scoped to a partial list is a
 * smaller scope that can come back legitimately empty, which is the cold start showing "Nothing
 * needs you". Here the remaining rule is the round's own freshness.
 */
import { useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useNowMinute } from "~/hooks/useNowMinute";
import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { JiraSessionExpiredPanel } from "~/t3team/components/t3team-JiraSessionExpiredPanel";
import { JiraSignInPanel } from "~/t3team/components/t3team-JiraSignInPanel";
import { closeDigestPullRequest, openDigestTicket } from "~/t3team/t3team-digestPrAsideStore";
import { useMyWorkDigestGraph } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraph";
import { MyWorkLoadingAnimation } from "~/t3team/t3team-MyWorkLoadingAnimation";
import { resolveMyWorkDigestRenderState } from "~/t3team/t3team-myWorkDigestRenderState";
import { ProjectMyWorkDigestErrorState } from "~/t3team/t3team-ProjectMyWorkDigestErrorState";
import { ProjectMyWorkDigestRetryState } from "~/t3team/t3team-ProjectMyWorkDigestRetryState";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import { buildDigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { useT3TeamBetaFlags } from "~/t3team/t3team-betaFlags";

export function AllProjectsMyWorkDigestLens({
  boundProjects,
  onOpenTicket,
}: {
  readonly boundProjects: ReadonlyArray<ProjectShellProject>;
  readonly onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const { flags } = useT3TeamBetaFlags();
  const digest = useMyWorkDigestGraph({ projects: boundProjects, scope: "all" });
  // Minute-granular clock shared with the rest of the app: stable within a render, re-plans on tick.
  // useNowMinute yields UTC wall-clock text without a zone suffix; parse it as UTC.
  const nowMs = Date.parse(`${useNowMinute()}Z`);
  const graph = digest.graph;
  const plan = useMemo(() => (graph ? buildDigestPlan(graph, nowMs) : null), [graph, nowMs]);

  const renderState = resolveMyWorkDigestRenderState({
    status: digest.status,
    freshness: digest.freshness,
    sessionExpired: digest.sessionExpired,
    viewerUnresolved: digest.viewerUnresolved,
    hasGraph: graph !== null,
    ticketCount: graph?.tickets.length ?? 0,
  });
  // A failed fetch (backend still starting, timeout) is not terminal: the poller retries with
  // backoff and this recovers on its own, so it renders as "retrying" — never a raw error.
  if (renderState === "retrying") return <ProjectMyWorkDigestRetryState />;
  if (renderState === "loading") return <MyWorkLoadingAnimation />;
  if (renderState === "session-expired") {
    return <JiraSessionExpiredPanel onSignedIn={digest.reload} />;
  }
  if (renderState === "error") {
    return (
      <ProjectMyWorkDigestErrorState error={digest.error} onRetry={digest.reload} centered />
    );
  }
  if (renderState === "sign-in") {
    return (
      <JiraSignInPanel heading="Sign in to Jira to load your work." onSignedIn={digest.reload} />
    );
  }
  if (renderState === "empty" || !graph || !plan) {
    return (
      <T3SurfacePanel
        tone="dashed"
        className="px-6 py-10 text-center text-sm text-muted-foreground"
      >
        Nothing needs you
      </T3SurfacePanel>
    );
  }
  return (
    <ProjectMyWorkDigestView
      plan={plan}
      graph={graph}
      nowMs={nowMs}
      burndownVariant={flags.digestBurndownVariant}
      refreshing={digest.refreshing}
      emptyStateAllowed={digest.freshness === "fresh"}
      {...(digest.updatedAt !== undefined ? { updatedAtMs: digest.updatedAt } : {})}
      onOpenTicket={
        // Beta flag: rows open the ticket in-app, beside the digest (each ticket knows its
        // project); the full page is one click from there.
        flags.digestRowNavigation === "in-app"
          ? (ticketId: string) => {
              const ticket = graph.tickets.find((entry) => entry.id === ticketId);
              if (!ticket) return;
              openDigestTicket({
                projectId: ticket.projectId,
                ticketId,
                openFullPage: (shownTicketId) => {
                  closeDigestPullRequest();
                  onOpenTicket(ticket.projectId, shownTicketId);
                },
              });
            }
          : undefined
      }
    />
  );
}
