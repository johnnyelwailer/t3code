/**
 * "My work" across every bound project.
 *
 * Reached from the Work lens when the sidebar's project selector is on "All projects". Backlog has
 * no equivalent here on purpose: a backlog is a project's hierarchy plus that project's own Jira
 * planning and filter configuration, and flattening several of them loses the epic structure that
 * IS the view. "My work" is `assignee = currentUser()`, which is meaningful with or without a
 * project in hand.
 *
 * Composed by REUSING the per-project view once per bound project rather than by building a second
 * my-work implementation. That is not just cheaper — each project carries its own Atlassian account
 * and site binding, so its items are only interpretable next to the project they came from. A flat
 * merged list would have to drop or duplicate that context.
 */
import { useMemo } from "react";

import { ScrollArea } from "~/components/ui/scroll-area";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import { AppProjectIcon } from "~/t3team/t3team-AppStatusBits";
import { ProjectDashboardMyWorkView } from "~/t3team/t3team-ProjectDashboardMyWorkView";
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
  // Reads the store directly rather than taking projects/tickets as props: this is a leaf surface,
  // and threading two more props through the shell for one view is the kind of plumbing that makes
  // the next upstream merge harder.
  const { projects, getTicketsForProject } = useProjectStore();
  const boundProjects = useMemo(() => selectBoundProjects(projects), [projects]);

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
          <section key={project.id} className="flex min-w-0 flex-col gap-3">
            <header className="flex min-w-0 items-center gap-2">
              <AppProjectIcon project={project} />
              <h2 className="min-w-0 truncate font-medium text-sm">{project.title}</h2>
            </header>
            <ProjectDashboardMyWorkView
              project={project}
              fallbackTickets={getTicketsForProject(project.id)}
              onOpenTicket={onOpenTicket}
            />
          </section>
        ))}
      </div>
    </ScrollArea>
  );
}
