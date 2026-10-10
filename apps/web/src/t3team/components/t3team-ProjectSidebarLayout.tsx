import { SearchIcon, SettingsIcon } from "lucide-react";
import {
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "~/t3team/components/ui/t3team-sidebar";
import { APP_DISPLAY_NAME } from "~/t3team/t3team-branding";
import { T3TeamLeftSidebarHeaderToggle } from "~/t3team/t3team-LeftSidebarHeaderToggle";
import { useT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";
import type { ProjectShellProject } from "@t3tools/project-context";
import { LocalWorkspaceSidebarSection } from "./t3team-LocalWorkspaceSidebarSection";
import { ProjectSidebarHeader } from "./t3team-ProjectSidebarHeader";
import { ProjectSidebarProjectsSection } from "./t3team-ProjectSidebarProjectsSection";
import type { TicketViewMode } from "./t3team-projectSidebarShared";
import type { ProjectSidebarProps } from "./t3team-projectSidebarTypes";

type ProjectSidebarLayoutProps = {
  sortedProjects: ProjectShellProject[];
  looseWorkspaceProjects: ProjectShellProject[];
  ticketViewMode: TicketViewMode;
  setTicketViewMode: (mode: TicketViewMode) => void;
  showProjectThreads: boolean;
  showMyActivityFeed: boolean;
  showJiraItems: boolean;
  showGitHubActivity: boolean;
  onShowProjectThreadsChange: (show: boolean) => void;
  onShowMyActivityFeedChange: (show: boolean) => void;
  onShowJiraItemsChange: (show: boolean) => void;
  onShowGitHubActivityChange: (show: boolean) => void;
  onOpenSearch: () => void;
  onOpenSettings: (() => void) | undefined;
} & Omit<ProjectSidebarProps, "sidebarState" | "onSidebarStateChange">;

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
  activeDashboardMode,
  projectSortOrder,
  threadSortOrder,
  threadPreviewCount,
  showProjectThreads,
  showMyActivityFeed,
  showJiraItems,
  showGitHubActivity,
  onShowProjectThreadsChange,
  onShowMyActivityFeedChange,
  onShowJiraItemsChange,
  onShowGitHubActivityChange,
  onOpenSearch,
  onSelectProjectDashboardMode,
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
  const appearance = useT3TeamPackAppearance();
  const appName = appearance?.labels?.appName ?? APP_DISPLAY_NAME;

  return (
    <>
      <ProjectSidebarHeader appearance={appearance} appName={appName} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex min-h-full w-full min-w-0 flex-col gap-0">
            {/* The group's own inset is p-2; the pull-up keeps the search row 4px closer to
                the projects group below, as it sat before. */}
            <SidebarGroup className="-mb-1">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton size="sm" onClick={onOpenSearch}>
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
              activeDashboardMode={activeDashboardMode}
              projectSortOrder={projectSortOrder}
              threadSortOrder={threadSortOrder}
              threadPreviewCount={threadPreviewCount}
              showProjectThreads={showProjectThreads}
              showMyActivityFeed={showMyActivityFeed}
              showJiraItems={showJiraItems}
              showGitHubActivity={showGitHubActivity}
              onShowProjectThreadsChange={onShowProjectThreadsChange}
              onShowMyActivityFeedChange={onShowMyActivityFeedChange}
              onShowJiraItemsChange={onShowJiraItemsChange}
              onShowGitHubActivityChange={onShowGitHubActivityChange}
              onSelectProject={onSelectProject}
              onSelectProjectDashboardMode={onSelectProjectDashboardMode}
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
              onRenameProject={onRenameProject}
              onDeleteProject={onDeleteProject}
            />
          </div>
        </div>

        <SidebarSeparator className="shrink-0" />
        {/* The footer's own inset is py-1; the margin restores the 8px it sat in before. */}
        <SidebarFooter className="my-1 shrink-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-1">
                <SidebarMenuButton
                  size="sm"
                  className="min-w-0 flex-1"
                  onClick={onOpenSettings}
                  disabled={!onOpenSettings}
                  aria-disabled={!onOpenSettings}
                >
                  <SettingsIcon className="size-3.5" />
                  <span className="text-xs">Settings</span>
                </SidebarMenuButton>
                <T3TeamLeftSidebarHeaderToggle />
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </div>
    </>
  );
}
