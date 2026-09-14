/**
 * "My work" across every bound project.
 *
 * Reached from the Work lens when the sidebar's project selector is on "All projects". Backlog has
 * no equivalent here on purpose: a backlog is a project's hierarchy plus that project's own Jira
 * planning and filter configuration, and flattening several of them loses the epic structure that
 * IS the view. "My work" is `assignee = currentUser()`, which is meaningful with or without a
 * project in hand.
 *
 * Grouped by project rather than flattened: each project carries its own Atlassian account and site
 * binding, so its items are only interpretable next to the project they came from.
 *
 * Each section is a read-only slice built on the fetch-only hook (see
 * `t3team-AllProjectsMyWorkSection.tsx` for why it does NOT reuse `ProjectDashboardMyWorkView`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import { useProjectMyWork } from "~/t3team/hooks/t3team-useProjectMyWork";
import { useProjectDashboardMyWorkState } from "~/t3team/t3team-projectDashboardMyWorkState";
import {
  buildHeuristicDigestPlan,
  resolveDigestPlan,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import { useMyWorkDigestGraph } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraph";
import { AllProjectsMyWorkSection } from "~/t3team/t3team-AllProjectsMyWorkSection";
import { ProjectMyWorkDigestView } from "~/t3team/t3team-ProjectMyWorkDigestView";
import {
  ProjectMyWorkViewSwitch,
  type ProjectMyWorkLens,
} from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import { ProjectMyWorkLoadingState } from "~/t3team/t3team-projectMyWorkContentState";
import type { ProjectTicket } from "~/t3team/t3team-types";
import type { ProjectShellProject } from "@t3tools/project-context";

type AllProjectsMyWorkReport = {
  projectId: string;
  tickets: readonly ProjectTicket[];
  loading: boolean;
  error?: string | null;
};

/**
 * Fetch-only sibling of `AllProjectsMyWorkSection`: runs the same per-project fetch the
 * read-only sections use, reports the result upward, and renders nothing. The digest lens
 * aggregates across one of these per bound project so it does not double-fetch.
 */
function AllProjectsMyWorkDigestSource({
  project,
  onReport,
}: {
  project: ProjectShellProject;
  onReport: (report: AllProjectsMyWorkReport) => void;
}) {
  const { tickets, loading, error } = useProjectMyWork(project);
  const assigned = useMemo(() => tickets ?? [], [tickets]);
  useEffect(() => {
    onReport({ projectId: project.id, tickets: assigned, loading, error });
  }, [assigned, error, loading, onReport, project.id]);
  return null;
}

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
  const boundProjects = useMemo(() => selectBoundProjects(allProjects), [allProjects]);
  const { state, setState } = useProjectDashboardMyWorkState("all");
  const lens = state.lens;
  const setLens = useCallback(
    (value: ProjectMyWorkLens) => setState((current) => ({ ...current, lens: value })),
    [setState],
  );

  // The digest lens aggregates per-project tickets reported by the hidden digest sources below.
  const [sectionReports, setSectionReports] = useState<
    Readonly<Record<string, AllProjectsMyWorkReport>>
  >({});
  const handleReport = useCallback((report: AllProjectsMyWorkReport) => {
    setSectionReports((previous) => ({ ...previous, [report.projectId]: report }));
  }, []);

  const digestTickets = useMemo(
    () => Object.values(sectionReports).flatMap((report) => report.tickets),
    [sectionReports],
  );
  const projectByTicketId = useMemo(() => {
    const map = new Map<string, string>();
    for (const report of Object.values(sectionReports)) {
      for (const ticket of report.tickets) {
        map.set(ticket.id, report.projectId);
      }
    }
    return map;
  }, [sectionReports]);

  const { graph: digestGraph } = useMyWorkDigestGraph({
    scope: "all",
    tickets: digestTickets,
  });
  const digestPlan = useMemo(() => {
    if (!digestGraph) {
      return null;
    }
    const nowMs = Date.now();
    return resolveDigestPlan(buildHeuristicDigestPlan(digestGraph, nowMs), digestGraph, nowMs);
  }, [digestGraph]);

  if (boundProjects.length === 0) {
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
    const reports = Object.values(sectionReports);
    // Wait until every bound project has reported (or is done reporting) before drawing the
    // digest, so the first paint shows a loading state instead of a misleading empty one.
    if (reports.length < boundProjects.length || reports.some((report) => report.loading)) {
      return <ProjectMyWorkLoadingState />;
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
    return (
      <ProjectMyWorkDigestView
        plan={digestPlan}
        graph={digestGraph}
        nowMs={Date.now()}
        onOpenTicket={(ticketId) => {
          const projectId = projectByTicketId.get(ticketId);
          if (projectId) {
            onOpenTicket(projectId, ticketId);
          }
        }}
      />
    );
  };

  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 sm:p-6">
        <div>
          <ProjectMyWorkViewSwitch lens={lens} onLensChange={setLens} />
        </div>
        {lens === "digest" ? (
          <>
            <div className="hidden" aria-hidden="true">
              {boundProjects.map((project) => (
                <AllProjectsMyWorkDigestSource
                  key={project.id}
                  project={project}
                  onReport={handleReport}
                />
              ))}
            </div>
            {renderDigest()}
          </>
        ) : (
          boundProjects.map((project) => (
            <AllProjectsMyWorkSection
              key={project.id}
              project={project}
              onOpenTicket={onOpenTicket}
            />
          ))
        )}
      </div>
    </ScrollArea>
  );
}
