/**
 * "My work" across every bound project.
 *
 * Reached from the Work lens when the sidebar's project selector is on "All projects". A backlog has
 * no cross-project equivalent: it is a project's hierarchy plus that project's own Jira planning and
 * filter configuration, and flattening several of them loses the epic structure that IS the view.
 * So the Backlog segment of the view switch asks which project, then opens that project's backlog.
 * "My work" is `assignee = currentUser()`, which is meaningful with or without a project in hand.
 *
 * Grouped by project rather than flattened: each project carries its own Atlassian account and site
 * binding, so its items are only interpretable next to the project they came from.
 *
 * Each section is a read-only slice built on the fetch-only hook (see
 * `t3team-AllProjectsMyWorkSection.tsx` for why it does NOT reuse `ProjectDashboardMyWorkView`).
 */
import { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useNowMinute } from "~/hooks/useNowMinute";
import { useAllEnvironmentShellsBootstrapped } from "~/state/entities";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { JiraSessionExpiredPanel } from "~/t3team/components/t3team-JiraSessionExpiredPanel";
import { JiraSignInPanel } from "~/t3team/components/t3team-JiraSignInPanel";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import { useProjectDashboardMyWorkState } from "~/t3team/t3team-projectDashboardMyWorkState";
import { projectBacklogViewModes } from "~/t3team/t3team-projectBacklogPresentation";
import { readPersistedProjectDashboardBacklogState } from "~/t3team/t3team-projectDashboardBacklogState";
import { buildDigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { useMyWorkDigestGraph } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraph";
import { AllProjectsMyWorkSection } from "~/t3team/t3team-AllProjectsMyWorkSection";
import { ProjectMyWorkDigestErrorState } from "~/t3team/t3team-ProjectMyWorkDigestErrorState";
import { ProjectMyWorkDigestRetryState } from "~/t3team/t3team-ProjectMyWorkDigestRetryState";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import {
  ProjectMyWorkViewSwitch,
  type ProjectMyWorkLens,
} from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import { ProjectMyWorkLoadingState } from "~/t3team/t3team-projectMyWorkContentState";
import { useT3TeamBetaFlags } from "~/t3team/t3team-betaFlags";
import type { ProjectShellProject } from "@t3tools/project-context";

/**
 * Projects whose work items can be fetched at all: a local-only project has no external work
 * source, so a "my work" section for it would always be empty.
 */
export function selectBoundProjects(
  projects: ReadonlyArray<ProjectShellProject>,
): ReadonlyArray<ProjectShellProject> {
  return projects.filter((project) => project.source && project.source.provider !== "local");
}

export function AllProjectsMyWorkView({
  onOpenTicket,
}: {
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const { allProjects } = useProjectStore();
  const { flags } = useT3TeamBetaFlags();
  const boundProjects = useMemo(() => selectBoundProjects(allProjects), [allProjects]);
  const shellsBootstrapped = useAllEnvironmentShellsBootstrapped();
  const navigate = useNavigate();
  const openBacklog = useCallback(
    (projectId: string) =>
      void navigate({
        to: "/t3team/projects/$projectId",
        params: { projectId },
        search: {
          projectView: "backlog",
          // A backlog last left in the planning space would reopen there: Backlog is the table.
          ...(readPersistedProjectDashboardBacklogState(projectId)?.viewMode === "planning-space"
            ? { view: projectBacklogViewModes[0]?.value ?? "table" }
            : {}),
        },
      }),
    [navigate],
  );
  // The planning space is that project's backlog in its planning-space view mode (`?view=`).
  const openPlanning = useCallback(
    (projectId: string) =>
      void navigate({
        to: "/t3team/projects/$projectId",
        params: { projectId },
        search: { projectView: "backlog", view: "planning-space" },
      }),
    [navigate],
  );
  const { state, setState } = useProjectDashboardMyWorkState("all");
  const lens = state.lens;
  const setLens = useCallback(
    (value: ProjectMyWorkLens) => setState((current) => ({ ...current, lens: value })),
    [setState],
  );

  // The digest lens reads one server-aggregated graph across every bound project.
  const {
    graph: digestGraph,
    status: digestStatus,
    error: digestError,
    viewerUnresolved,
    sessionExpired: digestSessionExpired,
    updatedAt: digestUpdatedAt,
    reload: digestReload,
  } = useMyWorkDigestGraph({
    projects: boundProjects,
    scope: "all",
    enabled: lens === "digest",
  });
  // Minute-granular clock shared with the rest of the app: stable within a render, re-plans on tick.
  // useNowMinute yields UTC wall-clock text without a zone suffix; parse it as UTC.
  const nowMs = Date.parse(`${useNowMinute()}Z`);
  const digestPlan = useMemo(() => {
    if (!digestGraph) {
      return null;
    }
    return buildDigestPlan(digestGraph, nowMs);
  }, [digestGraph, nowMs]);

  if (boundProjects.length === 0) {
    // Until every environment has answered (or given up), "no projects" only means "not loaded yet".
    if (!shellsBootstrapped) {
      return (
        <div className="flex w-full flex-col p-4 sm:p-6">
          <ProjectMyWorkLoadingState />
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
        <p className="max-w-sm text-center text-muted-foreground text-sm">
          No projects are connected to a work source yet. Connect one to see the items assigned to
          you here.
        </p>
      </div>
    );
  }

  const renderDigest = () => {
    // A failed fetch (backend still starting, timeout) is not terminal: the poller retries with
    // backoff and this recovers on its own, so it renders as "retrying" — never a raw error.
    if (digestStatus === "retrying" && !digestGraph) {
      return <ProjectMyWorkDigestRetryState />;
    }
    // First paint shows a loading state instead of a misleading empty one.
    if (digestStatus === "loading" && !digestGraph) {
      return <ProjectMyWorkLoadingState />;
    }
    if (digestSessionExpired) {
      return <JiraSessionExpiredPanel onSignedIn={digestReload} />;
    }
    if (digestStatus === "error") {
      return <ProjectMyWorkDigestErrorState error={digestError} onRetry={digestReload} centered />;
    }
    if (viewerUnresolved && (digestGraph?.tickets.length ?? 0) === 0) {
      return (
        <JiraSignInPanel heading="Sign in to Jira to load your work." onSignedIn={digestReload} />
      );
    }
    if (!digestGraph || !digestPlan) {
      return (
        <T3SurfacePanel
          tone="dashed"
          className="px-6 py-10 text-center text-sm text-muted-foreground"
        >
          Nothing needs you
        </T3SurfacePanel>
      );
    }
    // TODO(digest-nav): rows open the ticket URL today; route through onOpenTicket once the digest
    // rows accept an in-app handler.
    return (
      <ProjectMyWorkDigestView
        plan={digestPlan}
        graph={digestGraph}
        nowMs={nowMs}
        burndownVariant={flags.digestBurndownVariant}
        {...(digestUpdatedAt !== undefined ? { updatedAtMs: digestUpdatedAt } : {})}
        onOpenTicket={
          // Beta flag: rows open the ticket in-app (each ticket knows its project).
          flags.digestRowNavigation === "in-app"
            ? (ticketId: string) => {
                const ticket = digestGraph.tickets.find((entry) => entry.id === ticketId);
                if (ticket) onOpenTicket(ticket.projectId, ticketId);
              }
            : undefined
        }
      />
    );
  };

  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div
        className={
          lens === "digest"
            ? // The digest spans the full pane width; the legacy sections keep the centered column.
              "flex w-full flex-col gap-8 p-4 sm:p-6"
            : "mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 sm:p-6"
        }
      >
        <div>
          <ProjectMyWorkViewSwitch
            lens={lens}
            onLensChange={setLens}
            backlog={{ kind: "pick-project", projects: boundProjects, onPick: openBacklog }}
            planning={{ kind: "pick-project", projects: boundProjects, onPick: openPlanning }}
          />
        </div>
        {lens === "digest"
          ? renderDigest()
          : boundProjects.map((project) => (
              <AllProjectsMyWorkSection
                key={project.id}
                project={project}
                lens={lens}
                onOpenTicket={onOpenTicket}
              />
            ))}
      </div>
    </ScrollArea>
  );
}
