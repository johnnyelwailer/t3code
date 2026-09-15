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
import { useMyWorkDigestGraph } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraph";
import { ProjectMyWorkDigestRetryState } from "~/t3team/t3team-ProjectMyWorkDigestRetryState";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import { useT3TeamBetaFlags } from "~/t3team/t3team-betaFlags";
import { ProjectMyWorkLoadingState } from "~/t3team/t3team-projectMyWorkContentState";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectShellProject } from "@t3tools/project-context";

// TODO(digest-nav): rows navigate to the ticket URL today; thread an in-app onOpenTicket through
// ProjectMyWorkDigestView -> DigestStoryGroup/DigestRow once the Storybook cut settles.
export function ProjectMyWorkDigestContent({
  project,
  onOpenTicket,
}: {
  project: ProjectShellProject;
  onOpenTicket: (projectId: string, ticketId: string) => void;
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
  // Minute-granular clock shared with the rest of the app: stable within a render, re-plans on tick.
  // useNowMinute yields UTC wall-clock text without a zone suffix; parse it as UTC.
  const nowMs = Date.parse(`${useNowMinute()}Z`);
  const plan = useMemo(() => {
    if (!graph) {
      return null;
    }
    return resolveDigestPlan(buildHeuristicDigestPlan(graph, nowMs), graph, nowMs);
  }, [graph, nowMs]);

  // A failed fetch (backend still starting, timeout) is not terminal: the poller retries with
  // backoff and this recovers on its own, so it renders as "retrying" — never a raw error.
  if (status === "retrying" && !graph) {
    return <ProjectMyWorkDigestRetryState />;
  }
  if (status === "loading" && !graph) {
    return <ProjectMyWorkLoadingState />;
  }
  if (sessionExpired) {
    return <JiraSessionExpiredPanel onSignedIn={reload} />;
  }
  if (status === "error") {
    // Only a genuinely terminal condition reaches here (e.g. this server has no digest endpoint).
    return (
      <T3SurfacePanel tone="dashed" className="px-4 py-8 text-sm text-muted-foreground">
        Could not load the digest view.
        {error ? <span className="block pt-1 text-xs opacity-80">{error}</span> : null}
      </T3SurfacePanel>
    );
  }
  if (viewerUnresolved && (graph?.tickets.length ?? 0) === 0) {
    return (
      <T3SurfacePanel tone="dashed" className="px-4 py-8 text-sm text-muted-foreground">
        Sign in to Jira under Settings → Connected tools to load your work.
      </T3SurfacePanel>
    );
  }
  if (!graph || !plan) {
    return (
      <T3SurfacePanel tone="dashed" className="px-4 py-8 text-sm text-muted-foreground">
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
      onOpenTicket={openTicketInApp}
    />
  );
}
