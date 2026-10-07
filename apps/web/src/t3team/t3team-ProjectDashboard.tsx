/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
import { EllipsisIcon, Link2 } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { Button } from "~/t3team/components/ui/t3team-button";
import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";
import { SidebarTrigger } from "~/t3team/components/ui/t3team-sidebar";
import { t3SurfaceBackdrops } from "~/t3team/components/ui/t3team-surface";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/t3team/components/ui/t3team-menu";
import { useProjectDashboardViewTab } from "~/t3team/hooks/t3team-useProjectDashboardViewTab";
import { getT3TeamMainContentHeaderClassName } from "~/t3team/t3team-mainContentHeader";
import { ProjectBindingRepairBanner } from "~/t3team/t3team-ProjectBindingRepairBanner";
import { ProjectDashboardBacklogView } from "~/t3team/t3team-ProjectDashboardBacklogView";
import { ProjectDashboardMyWorkView } from "~/t3team/t3team-ProjectDashboardMyWorkView";
import { ProjectMyWorkViewSwitch } from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function ProjectDashboard({
  project,
  tickets: fallbackTickets,
  shouldInsetDesktopHeader = false,
  onOpenTicket,
  onManageRepositories,
  onProjectUpdated,
}: {
  project: ProjectShellProject;
  tickets: ProjectTicket[];
  shouldInsetDesktopHeader?: boolean;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onManageRepositories: (projectId: string) => void;
  onProjectUpdated: (project: ProjectShellProject) => void;
}) {
  // One hook feeds the header control and the body below, so the URL (`?projectView=`,
  // `?myWorkLens=`), the segments and the rendered view cannot disagree.
  const {
    mode: dashboardMode,
    lens,
    backlogActive,
    planningActive,
    selectLens,
    selectBacklog,
    selectPlanning,
  } = useProjectDashboardViewTab(project.id);
  // Every lens is the same centered column, so switching lenses never jumps the width. The digest
  // grows with its content (min-h-full) so the bottom padding survives a tall digest instead of
  // being cut by a fixed h-full box; the list and board scroll inside a full-height box.
  const myWorkContentClassName =
    lens === "digest"
      ? "mx-auto flex min-h-full w-full max-w-[96rem] flex-col p-4 pb-6 sm:p-6"
      : "mx-auto flex h-full min-h-0 w-full max-w-[96rem] flex-col p-4 sm:p-6";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header
        className={getT3TeamMainContentHeaderClassName({
          className: "bg-gradient-to-b from-background to-muted/15",
          shouldInsetDesktopHeader,
        })}
      >
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <h2 className="min-w-0 truncate text-sm font-medium" title={project.title}>
            {project.title}
          </h2>
          <Menu>
            <MenuTrigger
              aria-label="Project actions"
              render={<Button size="icon-xs" variant="ghost-muted" />}
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
        <ProjectMyWorkViewSwitch
          lens={lens}
          onLensChange={selectLens}
          backlog={{ kind: "select", active: backlogActive, onSelect: selectBacklog }}
          planning={{ kind: "select", active: planningActive, onSelect: selectPlanning }}
        />
      </header>

      <ProjectBindingRepairBanner project={project} onProjectUpdated={onProjectUpdated} />

      <section
        className={`flex min-h-0 flex-1 flex-col overflow-hidden ${t3SurfaceBackdrops.dashboardContent}`}
      >
        {dashboardMode === "backlog" ? (
          <ProjectDashboardBacklogView project={project} onOpenTicket={onOpenTicket} />
        ) : (
          <ScrollArea className="h-full min-h-0 flex-1">
            <div className={myWorkContentClassName}>
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
