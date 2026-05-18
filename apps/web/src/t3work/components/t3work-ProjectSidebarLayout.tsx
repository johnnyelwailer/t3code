import { FolderPlusIcon, SearchIcon, SettingsIcon } from "lucide-react";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from "~/t3work/components/ui/t3work-sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3work/components/ui/t3work-tooltip";
import type { ProjectShellProject } from "@t3tools/project-context";
import { ProjectSortMenu } from "./t3work-ProjectSortMenu";
import { ProjectRowWithTickets } from "./t3work-ProjectSidebarProjectRow";
import { resolveProjectStatusIndicator, type TicketViewMode } from "./t3work-projectSidebarShared";
import type { ProjectSidebarProps } from "./t3work-projectSidebarTypes";

type ProjectSidebarLayoutProps = {
  sortedProjects: ProjectShellProject[];
  ticketViewMode: TicketViewMode;
  setTicketViewMode: (mode: TicketViewMode) => void;
  onOpenSettings: (() => void) | undefined;
} & ProjectSidebarProps;

export function ProjectSidebarLayout({
  sortedProjects,
  ticketViewMode,
  setTicketViewMode,
  onOpenSettings,
  projects,
  expandedIds,
  getThreadsForProject,
  view,
  projectSortOrder,
  threadSortOrder,
  threadPreviewCount,
  onSelectProject,
  onSelectTicket,
  onSelectThread,
  onToggleExpand,
  onCreateProject,
  onManageProjectRepositories,
  onDeleteProject,
  onRenameProject,
  onCreateThread,
  onCreateTicketThread,
  onDeleteThread,
  onRenameThread,
  onProjectSortOrderChange,
  onThreadSortOrderChange,
  onThreadPreviewCountChange,
}: ProjectSidebarLayoutProps) {
  return (
    <>
      <SidebarHeader className="gap-3 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="shrink-0 md:hidden" />
          <span className="truncate text-sm font-semibold">T3 Work</span>
          <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
            Work shell
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="px-2 pt-2 pb-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="sm"
                className="gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:ring-0"
              >
                <SearchIcon className="size-3.5" />
                <span className="flex-1 truncate text-left text-xs">Search</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="px-2 py-2">
          <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Projects
            </span>
            <div className="flex items-center gap-1">
              <ProjectSortMenu
                projectSortOrder={projectSortOrder}
                threadSortOrder={threadSortOrder}
                threadPreviewCount={threadPreviewCount}
                ticketViewMode={ticketViewMode}
                onProjectSortOrderChange={onProjectSortOrderChange}
                onTicketViewModeChange={setTicketViewMode}
                onThreadSortOrderChange={onThreadSortOrderChange}
                onThreadPreviewCountChange={onThreadPreviewCountChange}
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Add project"
                      className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                      onClick={onCreateProject}
                    />
                  }
                >
                  <FolderPlusIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipPopup side="right">Add project</TooltipPopup>
              </Tooltip>
            </div>
          </div>

          <SidebarMenu>
            {sortedProjects.map((project) => {
              const projectThreads = getThreadsForProject(project.id);
              const expanded = expandedIds.has(project.id);
              const projectStatus = resolveProjectStatusIndicator(projectThreads);
              return (
                <SidebarMenuItem key={project.id} className="mb-2 rounded-md last:mb-0">
                  <ProjectRowWithTickets
                    project={project}
                    projectThreads={projectThreads}
                    expanded={expanded}
                    projectStatus={projectStatus}
                    view={view}
                    threadSortOrder={threadSortOrder}
                    threadPreviewCount={threadPreviewCount}
                    ticketViewMode={ticketViewMode}
                    onSelectProject={onSelectProject}
                    onToggleExpand={onToggleExpand}
                    onSelectThread={onSelectThread}
                    onSelectTicket={onSelectTicket}
                    onManageProjectRepositories={onManageProjectRepositories}
                    onDeleteProject={onDeleteProject}
                    onRenameProject={onRenameProject}
                    onCreateThread={onCreateThread}
                    onCreateTicketThread={onCreateTicketThread}
                    onDeleteThread={onDeleteThread}
                    onRenameThread={onRenameThread}
                  />
                </SidebarMenuItem>
              );
            })}

            {projects.length === 0 && (
              <div className="px-2 pt-4 text-center text-xs text-muted-foreground/60">
                No projects yet
              </div>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              className="gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
              onClick={onOpenSettings}
            >
              <SettingsIcon className="size-3.5" />
              <span className="text-xs">Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
