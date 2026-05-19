import { FolderPlusIcon, SearchIcon, SettingsIcon } from "lucide-react";
import {
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
import { isElectron } from "~/env";
import { LocalWorkspaceSidebarSection } from "./t3work-LocalWorkspaceSidebarSection";
import { ProjectSidebarProjectsSection } from "./t3work-ProjectSidebarProjectsSection";
import { ProjectSortMenu } from "./t3work-ProjectSortMenu";
import type { TicketViewMode } from "./t3work-projectSidebarShared";
import type { ProjectSidebarProps } from "./t3work-projectSidebarTypes";

type ProjectSidebarLayoutProps = {
  sortedProjects: ProjectShellProject[];
  looseWorkspaceProjects: ProjectShellProject[];
  ticketViewMode: TicketViewMode;
  setTicketViewMode: (mode: TicketViewMode) => void;
  showProjectThreads: boolean;
  showJiraItems: boolean;
  showGitHubActivity: boolean;
  onShowProjectThreadsChange: (show: boolean) => void;
  onShowJiraItemsChange: (show: boolean) => void;
  onShowGitHubActivityChange: (show: boolean) => void;
  onOpenSearch: () => void;
  onOpenSettings: (() => void) | undefined;
} & ProjectSidebarProps;

export function ProjectSidebarLayout({
  sortedProjects,
  looseWorkspaceProjects,
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
  showProjectThreads,
  showJiraItems,
  showGitHubActivity,
  onShowProjectThreadsChange,
  onShowJiraItemsChange,
  onShowGitHubActivityChange,
  onOpenSearch,
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
  const sidebarHeaderClassName = isElectron
    ? "drag-region h-[52px] flex-row items-center gap-2 px-4 py-0 pl-[90px] wco:h-[env(titlebar-area-height)] wco:pl-[calc(env(titlebar-area-x)+1em)]"
    : "gap-3 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-3";

  return (
    <>
      <SidebarHeader className={sidebarHeaderClassName}>
        <div className="flex items-center gap-2">
          <SidebarTrigger className="shrink-0 md:hidden" />
          <span className="truncate text-sm font-semibold">T3 Work</span>
          <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
            Work shell
          </span>
        </div>
      </SidebarHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex min-h-full w-full min-w-0 flex-col gap-0">
            <SidebarGroup className="px-2 pt-2 pb-1">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="sm"
                    className="gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:ring-0"
                    onClick={onOpenSearch}
                  >
                    <SearchIcon className="size-3.5" />
                    <span className="flex-1 truncate text-left text-xs">Search</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>

            <ProjectSidebarProjectsSection
              sortedProjects={sortedProjects}
              setTicketViewMode={setTicketViewMode}
              projects={projects}
              expandedIds={expandedIds}
              getThreadsForProject={getThreadsForProject}
              view={view}
              projectSortOrder={projectSortOrder}
              threadSortOrder={threadSortOrder}
              threadPreviewCount={threadPreviewCount}
              showProjectThreads={showProjectThreads}
              showJiraItems={showJiraItems}
              showGitHubActivity={showGitHubActivity}
              onShowProjectThreadsChange={onShowProjectThreadsChange}
              onShowJiraItemsChange={onShowJiraItemsChange}
              onShowGitHubActivityChange={onShowGitHubActivityChange}
              onSelectProject={onSelectProject}
              onSelectTicket={onSelectTicket}
              onSelectThread={onSelectThread}
              onToggleExpand={onToggleExpand}
              onCreateProject={onCreateProject}
              onManageProjectRepositories={onManageProjectRepositories}
              onDeleteProject={onDeleteProject}
              onRenameProject={onRenameProject}
              onCreateThread={onCreateThread}
              onCreateTicketThread={onCreateTicketThread}
              onDeleteThread={onDeleteThread}
              onRenameThread={onRenameThread}
              onProjectSortOrderChange={onProjectSortOrderChange}
              onThreadSortOrderChange={onThreadSortOrderChange}
              onThreadPreviewCountChange={onThreadPreviewCountChange}
              ticketViewMode={ticketViewMode}
            />

            <LocalWorkspaceSidebarSection
              looseWorkspaceProjects={looseWorkspaceProjects}
              expandedIds={expandedIds}
              getThreadsForProject={getThreadsForProject}
              view={view}
              threadSortOrder={threadSortOrder}
              threadPreviewCount={threadPreviewCount}
              onToggleExpand={onToggleExpand}
              onSelectThread={onSelectThread}
              onCreateThread={onCreateThread}
              onDeleteThread={onDeleteThread}
              onRenameThread={onRenameThread}
            />
          </div>
        </div>

        <SidebarSeparator className="shrink-0" />
        <SidebarFooter className="shrink-0 p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="sm"
                className="gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                onClick={onOpenSettings}
                disabled={!onOpenSettings}
                aria-disabled={!onOpenSettings}
              >
                <SettingsIcon className="size-3.5" />
                <span className="text-xs">Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </div>
    </>
  );
}
