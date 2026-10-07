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
 *
 * The scoped project list comes from `useMyWorkBoundProjects` — the same hook the startup gate
 * probes with, so the cold-start redirect lands on the digest cache the gate's own round filled.
 */
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import { ScrollArea } from "~/components/ui/scroll-area";
import { useMyWorkBoundProjects } from "~/t3team/t3team-myWorkBoundProjects";
import { useProjectDashboardMyWorkState } from "~/t3team/t3team-projectDashboardMyWorkState";
import { projectBacklogViewModes } from "~/t3team/t3team-projectBacklogPresentation";
import { readPersistedProjectDashboardBacklogState } from "~/t3team/t3team-projectDashboardBacklogState";
import { AllProjectsMyWorkDigestLens } from "~/t3team/t3team-AllProjectsMyWorkDigestLens";
import { AllProjectsMyWorkSection } from "~/t3team/t3team-AllProjectsMyWorkSection";
import {
  ProjectMyWorkViewSwitch,
  type ProjectMyWorkLens,
} from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import { MyWorkLoadingAnimation } from "~/t3team/t3team-MyWorkLoadingAnimation";
import { t3teamScopeContentWidthClass } from "~/t3team/t3team-scopeContentWidth";

export function AllProjectsMyWorkView({
  onOpenTicket,
}: {
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const boundProjects = useMyWorkBoundProjects();
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

  if (boundProjects === null) {
    // The project list is still being assembled: "no projects" would be a guess, not an answer.
    return (
      <div className="flex w-full flex-col p-4 sm:p-6">
        <MyWorkLoadingAnimation />
      </div>
    );
  }

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

  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div
        className={`mx-auto flex w-full ${t3teamScopeContentWidthClass} flex-col gap-8 p-4 sm:p-6`}
      >
        <div>
          <ProjectMyWorkViewSwitch
            lens={lens}
            onLensChange={setLens}
            backlog={{ kind: "pick-project", projects: boundProjects, onPick: openBacklog }}
            planning={{ kind: "pick-project", projects: boundProjects, onPick: openPlanning }}
          />
        </div>
        {lens === "digest" ? (
          <AllProjectsMyWorkDigestLens
            boundProjects={boundProjects}
            onOpenTicket={onOpenTicket}
          />
        ) : (
          boundProjects.map((project) => (
            <AllProjectsMyWorkSection
              key={project.id}
              project={project}
              lens={lens}
              onOpenTicket={onOpenTicket}
            />
          ))
        )}
      </div>
    </ScrollArea>
  );
}
