import { useCallback, useMemo, useState } from "react";
import type { ProjectThread } from "~/t3work/t3work-types";
import { sortProjects, type TicketViewMode } from "./t3work-projectSidebarShared";
import { ProjectSidebarLayout } from "./t3work-ProjectSidebarLayout";
import type { ProjectSidebarProps } from "./t3work-projectSidebarTypes";
import { readLocalApi } from "~/localApi";

export function ProjectSidebar({
  projects,
  selectedId,
  expandedIds,
  threads,
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
  onOpenSettings,
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
}: ProjectSidebarProps) {
  const [ticketViewMode, setTicketViewMode] = useState<TicketViewMode>("tree");
  const [showProjectThreads, setShowProjectThreads] = useState(true);
  const [showJiraItems, setShowJiraItems] = useState(true);
  const [showGitHubActivity, setShowGitHubActivity] = useState(true);

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
      const insideProjectHeader = target.closest(".group/project-header");
      const insideTicket = target.closest(".group/ticket");
      if (insideProjectHeader || insideTicket) return;

      event.preventDefault();
      const api = readLocalApi();
      if (!api) return;

      const action = await api.contextMenu.show(
        [
          {
            id: "toggle-project-threads",
            label: showProjectThreads ? "Hide project threads" : "Show project threads",
          },
          {
            id: "toggle-jira-items",
            label: showJiraItems ? "Hide Jira items" : "Show Jira items",
          },
          {
            id: "toggle-github-activity",
            label: showGitHubActivity ? "Hide GitHub activity" : "Show GitHub activity",
          },
        ],
        { x: event.clientX, y: event.clientY },
      );

      if (action === "toggle-project-threads") {
        setShowProjectThreads((prev) => !prev);
      } else if (action === "toggle-jira-items") {
        setShowJiraItems((prev) => !prev);
      } else if (action === "toggle-github-activity") {
        setShowGitHubActivity((prev) => !prev);
      }
    },
    [showGitHubActivity, showJiraItems, showProjectThreads],
  );

  return (
    <div onContextMenu={handleGlobalSidebarContextMenu}>
      <ProjectSidebarLayout
        sortedProjects={sortedProjects}
        ticketViewMode={ticketViewMode}
        setTicketViewMode={setTicketViewMode}
        projects={projects}
        selectedId={selectedId}
        expandedIds={expandedIds}
        threads={threads}
        getThreadsForProject={getThreadsForProject}
        view={view}
        projectSortOrder={projectSortOrder}
        threadSortOrder={threadSortOrder}
        threadPreviewCount={threadPreviewCount}
        showProjectThreads={showProjectThreads}
        showJiraItems={showJiraItems}
        showGitHubActivity={showGitHubActivity}
        onSelectProject={onSelectProject}
        onSelectTicket={onSelectTicket}
        onSelectThread={onSelectThread}
        onToggleExpand={onToggleExpand}
        onCreateProject={onCreateProject}
        onOpenSettings={onOpenSettings}
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
      />
    </div>
  );
}
