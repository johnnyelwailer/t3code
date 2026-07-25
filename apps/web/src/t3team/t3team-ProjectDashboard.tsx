import { BookOpenCheck, EllipsisIcon, Link2 } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";
import { SidebarTrigger } from "~/t3team/components/ui/t3team-sidebar";
import { t3SurfaceBackdrops } from "~/t3team/components/ui/t3team-surface";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/t3team/components/ui/t3team-menu";
import { AppProjectIcon } from "~/t3team/t3team-AppStatusBits";
import { useProjectDashboardModeState } from "~/t3team/hooks/t3team-useProjectDashboardModeState";
import { getT3TeamMainContentHeaderClassName } from "~/t3team/t3team-mainContentHeader";
import { ProjectDashboardBacklogView } from "~/t3team/t3team-ProjectDashboardBacklogView";
import { ProjectDashboardMyWorkView } from "~/t3team/t3team-ProjectDashboardMyWorkView";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function ProjectDashboard({
  project,
  tickets: fallbackTickets,
  shouldInsetDesktopHeader = false,
  onOpenTicket,
  onManageRepositories,
  onManageRecipes,
}: {
  project: ProjectShellProject;
  tickets: ProjectTicket[];
  shouldInsetDesktopHeader?: boolean;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onManageRepositories: (projectId: string) => void;
  onManageRecipes: (projectId: string) => void;
}) {
  const { state: dashboardState } = useProjectDashboardModeState(project.id);
  const dashboardMode = dashboardState.dashboardMode;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header
        className={getT3TeamMainContentHeaderClassName({
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
            <MenuTrigger className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground">
              <EllipsisIcon className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="start" side="bottom" className="min-w-48">
              <MenuItem onClick={() => onManageRecipes(project.id)}>
                <BookOpenCheck className="size-4" />
                Manage recipes
              </MenuItem>
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
