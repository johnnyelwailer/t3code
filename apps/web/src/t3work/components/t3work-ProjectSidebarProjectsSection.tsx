import { FolderPlusIcon } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { SidebarGroup, SidebarMenu, SidebarMenuItem } from "~/t3work/components/ui/t3work-sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3work/components/ui/t3work-tooltip";
import { ProjectSortMenu } from "./t3work-ProjectSortMenu";
import { ProjectRowWithTickets } from "./t3work-ProjectSidebarProjectRow";
import { resolveProjectStatusIndicator, type TicketViewMode } from "./t3work-projectSidebarShared";
import type { ProjectSidebarProps } from "./t3work-projectSidebarTypes";

type ProjectSidebarProjectsSectionProps = Pick<
  ProjectSidebarProps,
  | "projects"
  | "expandedIds"
  | "getThreadsForProject"
  | "view"
  | "activeDashboardMode"
  | "projectSortOrder"
  | "threadSortOrder"
  | "threadPreviewCount"
  | "onSelectProject"
  | "onSelectProjectDashboardMode"
  | "onSelectTicket"
  | "onSelectThread"
  | "onToggleExpand"
  | "onCreateProject"
  | "onManageProjectRecipes"
  | "onManageProjectRepositories"
  | "onDeleteProject"
  | "onRenameProject"
  | "onCreateThread"
  | "onCreateTicketThread"
  | "onDeleteThread"
  | "onRenameThread"
  | "onProjectSortOrderChange"
  | "onThreadSortOrderChange"
  | "onThreadPreviewCountChange"
> & {
  sortedProjects: ProjectShellProject[];
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
};

export function ProjectSidebarProjectsSection({
  sortedProjects,
  setTicketViewMode,
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
  onSelectProject,
  onSelectProjectDashboardMode,
  onSelectTicket,
  onSelectThread,
  onToggleExpand,
  onCreateProject,
  onManageProjectRecipes,
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
  ticketViewMode,
}: ProjectSidebarProjectsSectionProps) {
  return (
    <SidebarGroup className="px-2 py-2">
      <div className="group/projects-header mb-1 flex items-center justify-between pl-2 pr-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Projects
        </span>
        <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 pointer-events-none group-hover/projects-header:opacity-100 group-hover/projects-header:pointer-events-auto group-focus-within/projects-header:opacity-100 group-focus-within/projects-header:pointer-events-auto">
          <ProjectSortMenu
            projectSortOrder={projectSortOrder}
            threadSortOrder={threadSortOrder}
            threadPreviewCount={threadPreviewCount}
            ticketViewMode={ticketViewMode}
            showProjectThreads={showProjectThreads}
            showMyActivityFeed={showMyActivityFeed}
            showJiraItems={showJiraItems}
            showGitHubActivity={showGitHubActivity}
            onProjectSortOrderChange={onProjectSortOrderChange}
            onTicketViewModeChange={setTicketViewMode}
            onThreadSortOrderChange={onThreadSortOrderChange}
            onThreadPreviewCountChange={onThreadPreviewCountChange}
            onShowProjectThreadsChange={onShowProjectThreadsChange}
            onShowMyActivityFeedChange={onShowMyActivityFeedChange}
            onShowJiraItemsChange={onShowJiraItemsChange}
            onShowGitHubActivityChange={onShowGitHubActivityChange}
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
                activeDashboardMode={activeDashboardMode}
                threadSortOrder={threadSortOrder}
                threadPreviewCount={threadPreviewCount}
                ticketViewMode={ticketViewMode}
                showProjectThreads={showProjectThreads}
                showMyActivityFeed={showMyActivityFeed}
                showJiraItems={showJiraItems}
                showGitHubActivity={showGitHubActivity}
                onSelectProject={onSelectProject}
                onSelectProjectDashboardMode={onSelectProjectDashboardMode}
                onToggleExpand={onToggleExpand}
                onSelectThread={onSelectThread}
                onSelectTicket={onSelectTicket}
                onManageProjectRecipes={onManageProjectRecipes}
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

        {projects.length === 0 ? (
          <div className="px-2 pt-4 text-center text-xs text-muted-foreground/60">
            No projects yet
          </div>
        ) : null}
      </SidebarMenu>
    </SidebarGroup>
  );
}
