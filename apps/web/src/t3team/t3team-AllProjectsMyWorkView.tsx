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
import { useCallback, useMemo } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
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
  const { state, setState } = useProjectDashboardMyWorkState("all");
  const lens = state.lens;
  const setLens = useCallback(
    (value: ProjectMyWorkLens) => setState((current) => ({ ...current, lens: value })),
    [setState],
  );

  // The digest lens reads one server-aggregated graph across every bound project.
  const { graph: digestGraph, status: digestStatus } = useMyWorkDigestGraph({
    projects: boundProjects,
    scope: "all",
    enabled: lens === "digest",
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
    // First paint shows a loading state instead of a misleading empty one.
    if (digestStatus === "loading" && !digestGraph) {
      return <ProjectMyWorkLoadingState />;
    }
    if (digestStatus === "error") {
      return (
        <T3SurfacePanel
          tone="dashed"
          className="px-6 py-10 text-center text-sm text-muted-foreground"
        >
          Could not load the digest view.
        </T3SurfacePanel>
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
        nowMs={Date.now()}
        burndownVariant={flags.digestBurndownVariant}
      />
    );
  };

  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 sm:p-6">
        <div>
          <ProjectMyWorkViewSwitch lens={lens} onLensChange={setLens} />
        </div>
        {lens === "digest"
          ? renderDigest()
          : boundProjects.map((project) => (
              <AllProjectsMyWorkSection
                key={project.id}
                project={project}
                onOpenTicket={onOpenTicket}
              />
            ))}
      </div>
    </ScrollArea>
  );
}
