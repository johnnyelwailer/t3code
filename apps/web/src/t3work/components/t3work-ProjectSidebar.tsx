import { useMemo, useState } from "react";
import type { ProjectThread } from "~/t3work/t3work-types";
import { sortProjects, type TicketViewMode } from "./t3work-projectSidebarShared";
import { ProjectSidebarLayout } from "./t3work-ProjectSidebarLayout";
import type { ProjectSidebarProps } from "./t3work-projectSidebarTypes";

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

  return (
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
  );
}
