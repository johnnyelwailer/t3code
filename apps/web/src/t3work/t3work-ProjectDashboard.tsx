import { EllipsisIcon, Link2 } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { ScrollArea } from "~/t3work/components/ui/t3work-scroll-area";
import { SidebarTrigger } from "~/t3work/components/ui/t3work-sidebar";
import { t3SurfaceBackdrops } from "~/t3work/components/ui/t3work-surface";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/t3work/components/ui/t3work-menu";
import { AppProjectIcon } from "~/t3work/t3work-AppStatusBits";
import { useProjectDashboardModeState } from "~/t3work/hooks/t3work-useProjectDashboardModeState";
import { getT3workMainContentHeaderClassName } from "~/t3work/t3work-mainContentHeader";
import { ProjectDashboardBacklogView } from "~/t3work/t3work-ProjectDashboardBacklogView";
import { ProjectDashboardMyWorkView } from "~/t3work/t3work-ProjectDashboardMyWorkView";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function ProjectDashboard({
  project,
  tickets: fallbackTickets,
  shouldInsetDesktopHeader = false,
  onOpenTicket,
  onManageRepositories,
}: {
  project: ProjectShellProject;
  tickets: ProjectTicket[];
  shouldInsetDesktopHeader?: boolean;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onManageRepositories: (projectId: string) => void;
}) {
  const { state: dashboardState } = useProjectDashboardModeState(project.id);
  const dashboardMode = dashboardState.dashboardMode;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header
        className={getT3workMainContentHeaderClassName({
          className: "bg-gradient-to-b from-background to-muted/15",
          shouldInsetDesktopHeader,
        })}
      >
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        <AppProjectIcon project={project} />
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <h2 className="min-w-0 truncate text-sm font-medium" title={project.title}>
            {project.title}
          </h2>
          <Menu>
            <MenuTrigger
              aria-label={`Project actions for ${project.title}`}
              className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
            >
              <EllipsisIcon className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="start" side="bottom" className="min-w-48">
              <MenuItem onClick={() => onManageRepositories(project.id)}>
                <Link2 className="size-4" />
                Manage linked repositories
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </header>

      <section
        className={`flex min-h-0 flex-1 flex-col overflow-hidden ${t3SurfaceBackdrops.dashboardContent}`}
      >
        {dashboardMode === "backlog" ? (
          <ProjectDashboardBacklogView project={project} onOpenTicket={onOpenTicket} />
        ) : (
          <ScrollArea className="h-full min-h-0 flex-1">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col p-4 sm:p-6">
              <ProjectDashboardMyWorkView
                project={project}
                fallbackTickets={fallbackTickets}
                onOpenTicket={onOpenTicket}
              />
            </div>
          </ScrollArea>
        )}
      </section>
    </div>
  );
}
