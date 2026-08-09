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
import { useMemo } from "react";

import { ScrollArea } from "~/components/ui/scroll-area";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import { AllProjectsMyWorkSection } from "~/t3team/t3team-AllProjectsMyWorkSection";
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
  // Reads the store directly rather than taking projects as a prop: this is a leaf surface, and
  // threading it through the shell for one view is the kind of plumbing that makes the next
  // upstream merge harder. `allProjects`, not `projects`: the latter omits loose workspace
  // projects, which can be Jira-bound and would then be missing from the roll-up while the sidebar
  // still lists them.
  const { allProjects } = useProjectStore();
  const boundProjects = useMemo(() => selectBoundProjects(allProjects), [allProjects]);

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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 sm:p-6">
        {boundProjects.map((project) => (
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
