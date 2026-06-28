import { useCallback, useMemo } from "react";
import type { ProjectThread } from "~/t3work/t3work-types";
import { clampProjectSidebarThreadPreviewCount } from "~/t3work/t3work-projectSidebarState";
import { sortProjects, type TicketViewMode } from "./t3work-projectSidebarShared";
import { ProjectSidebarLayout } from "./t3work-ProjectSidebarLayout";
import type { ProjectSidebarProps } from "./t3work-projectSidebarTypes";
import { readLocalApi } from "~/localApi";

export function ProjectSidebar({
  projects,
  looseWorkspaceProjects,
  selectedId,
  expandedIds,
  threads,
  getThreadsForProject,
  view,
  projectSortOrder,
  threadSortOrder,
  threadPreviewCount,
  sidebarState,
  activeDashboardMode,
  onSelectProject,
  onSelectProjectDashboardMode,
  onSelectTicket,
  onSelectThread,
  onToggleExpand,
  onOpenSearch,
  onCreateProject,
  onOpenSettings,
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
  onSidebarStateChange,
}: ProjectSidebarProps) {
  const threadsByProject = useMemo(() => {
    const map = new Map<string, ProjectThread[]>();
    for (const thread of threads) {
      const existing = map.get(thread.projectId) ?? [];
      existing.push(thread);
      map.set(thread.projectId, existing);
    }
    return map;
  }, [threads]);

  const sortedProjects = useMemo(
    () => sortProjects(projects, threadsByProject, projectSortOrder),
    [projects, threadsByProject, projectSortOrder],
  );

  const handleGlobalSidebarContextMenu = useCallback(
    async (event: React.MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const insideProjectHeader = target.closest(".group\\/project-header");
      const insideTicket = target.closest(".group\\/ticket-card, .group\\/pinned-ticket");
      if (insideProjectHeader || insideTicket) return;

      event.preventDefault();
      const api = readLocalApi();
      if (!api) return;

      const action = await api.contextMenu.show(
        [
          {
            id: "toggle-project-threads",
            label: sidebarState.showProjectThreads
              ? "Hide project threads"
              : "Show project threads",
          },
          {
            id: "toggle-my-activity-feed",
            label: sidebarState.showMyActivityFeed
              ? "Hide My activity feed"
              : "Show My activity feed",
          },
          {
            id: "toggle-jira-items",
            label: sidebarState.showJiraItems ? "Hide Jira items" : "Show Jira items",
          },
          {
            id: "toggle-github-activity",
            label: sidebarState.showGitHubActivity
              ? "Hide GitHub activity"
              : "Show GitHub activity",
          },
        ],
        { x: event.clientX, y: event.clientY },
      );

      if (action === "toggle-project-threads") {
        onSidebarStateChange((current) => ({
          ...current,
          showProjectThreads: !current.showProjectThreads,
        }));
      } else if (action === "toggle-my-activity-feed") {
        onSidebarStateChange((current) => ({
          ...current,
          showMyActivityFeed: !current.showMyActivityFeed,
        }));
      } else if (action === "toggle-jira-items") {
        onSidebarStateChange((current) => ({
          ...current,
          showJiraItems: !current.showJiraItems,
        }));
      } else if (action === "toggle-github-activity") {
        onSidebarStateChange((current) => ({
          ...current,
          showGitHubActivity: !current.showGitHubActivity,
        }));
      }
    },
    [
      onSidebarStateChange,
      sidebarState.showGitHubActivity,
      sidebarState.showJiraItems,
      sidebarState.showMyActivityFeed,
      sidebarState.showProjectThreads,
    ],
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onContextMenu={handleGlobalSidebarContextMenu}
    >
      <ProjectSidebarLayout
        sortedProjects={sortedProjects}
        looseWorkspaceProjects={looseWorkspaceProjects}
        ticketViewMode={sidebarState.ticketViewMode}
        setTicketViewMode={(ticketViewMode: TicketViewMode) => {
          onSidebarStateChange((current) => ({ ...current, ticketViewMode }));
        }}
        projects={projects}
        selectedId={selectedId}
        expandedIds={expandedIds}
        threads={threads}
        getThreadsForProject={getThreadsForProject}
        view={view}
        activeDashboardMode={activeDashboardMode}
        projectSortOrder={projectSortOrder}
        threadSortOrder={threadSortOrder}
        threadPreviewCount={threadPreviewCount}
        showProjectThreads={sidebarState.showProjectThreads}
        showMyActivityFeed={sidebarState.showMyActivityFeed}
        showJiraItems={sidebarState.showJiraItems}
        showGitHubActivity={sidebarState.showGitHubActivity}
        onShowProjectThreadsChange={(showProjectThreads) => {
          onSidebarStateChange((current) => ({ ...current, showProjectThreads }));
        }}
        onShowMyActivityFeedChange={(showMyActivityFeed) => {
          onSidebarStateChange((current) => ({ ...current, showMyActivityFeed }));
        }}
        onShowJiraItemsChange={(showJiraItems) => {
          onSidebarStateChange((current) => ({ ...current, showJiraItems }));
        }}
        onShowGitHubActivityChange={(showGitHubActivity) => {
          onSidebarStateChange((current) => ({ ...current, showGitHubActivity }));
        }}
        onSelectProject={onSelectProject}
        onSelectProjectDashboardMode={onSelectProjectDashboardMode}
        onSelectTicket={onSelectTicket}
        onSelectThread={onSelectThread}
        onToggleExpand={onToggleExpand}
        onOpenSearch={onOpenSearch}
        onCreateProject={onCreateProject}
        onOpenSettings={onOpenSettings}
        onManageProjectRecipes={onManageProjectRecipes}
        onManageProjectRepositories={onManageProjectRepositories}
        onDeleteProject={onDeleteProject}
        onRenameProject={onRenameProject}
        onCreateThread={onCreateThread}
        onCreateTicketThread={onCreateTicketThread}
        onDeleteThread={onDeleteThread}
        onRenameThread={onRenameThread}
        onProjectSortOrderChange={onProjectSortOrderChange}
        onThreadSortOrderChange={onThreadSortOrderChange}
        onThreadPreviewCountChange={(count) => {
          onThreadPreviewCountChange(clampProjectSidebarThreadPreviewCount(count));
        }}
      />
    </div>
  );
}
