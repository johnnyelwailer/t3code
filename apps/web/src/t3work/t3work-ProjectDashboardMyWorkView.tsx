import { useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { ProjectDashboardUnmatchedActivity } from "~/t3work/t3work-ProjectDashboardUnmatchedActivity";
import { ProjectMyWorkContent } from "~/t3work/t3work-ProjectMyWorkContent";
import { ProjectMyWorkFilterBar } from "~/t3work/t3work-ProjectMyWorkFilterBar";
import { readLinkedRepositoryUrlsFromProject } from "~/t3work/hooks/t3work-createProjectBootstrap";
import { useProjectDashboardMyWorkRecipeSupport } from "~/t3work/hooks/t3work-useProjectDashboardMyWorkRecipeSupport";
import { useProjectGitHubActivity } from "~/t3work/hooks/t3work-useProjectGitHubActivity";
import { useProjectKanbanStatusMutation } from "~/t3work/hooks/t3work-useProjectKanbanStatusMutation";
import { useProjectMyWorkState } from "~/t3work/hooks/t3work-useProjectMyWorkState";
import { useProjectWorkspaceAutoSync } from "~/t3work/hooks/t3work-useProjectWorkspaceAutoSync";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function ProjectDashboardMyWorkView({
  project,
  fallbackTickets,
  onOpenTicket,
}: {
  project: ProjectShellProject;
  fallbackTickets: ProjectTicket[];
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const linkedRepositoryUrls = useMemo(
    () => readLinkedRepositoryUrlsFromProject(project),
    [project],
  );
  const githubActivity = useProjectGitHubActivity({
    project,
    linkedRepositoryUrls,
    enabled: true,
  });
  const {
    loading,
    tickets,
    reloadTickets,
    jiraLastCheckedAt,
    query,
    setQuery,
    viewMode,
    setViewMode,
    groupMode,
    setGroupMode,
    showGitHubActivity,
    setShowGitHubActivity,
    statusCategory,
    setStatusCategory,
    activeOptionsCount,
    excludedTypeKeys,
    hiddenKanbanColumnIds,
    epicsHidden,
    setEpicsHidden,
    toggleKanbanLaneVisibility,
    toggleTypeVisibility,
    typeOptions,
    kanbanLaneOptions,
    selectedPriority,
    setSelectedPriority,
    priorityOptions,
    selectedStatus,
    setSelectedStatus,
    statusOptions,
    tableSortBy,
    setTableSortBy,
    tableSortDirection,
    setTableSortDirection,
    resetOptionsFilters,
    assignedWorkItems,
    filteredWorkItems,
    visibleHierarchy,
    kanbanColumns,
    parentChildGroups,
  } = useProjectMyWorkState({ project, fallbackTickets });
  const { canMoveTickets, moveTicketToStatus } = useProjectKanbanStatusMutation({
    project,
    reloadTickets,
  });
  useProjectDashboardMyWorkRecipeSupport({
    state: {
      query,
      viewMode,
      groupMode,
      statusCategory,
      showGitHubActivity,
      hiddenKanbanColumnIds,
      hasCustomizedKanbanLanes: hiddenKanbanColumnIds.length > 0,
      excludedTypeKeys,
      selectedPriority,
      selectedStatus,
      tableSortBy,
      tableSortDirection,
    },
    filteredWorkItems,
    setQuery,
    setStatusCategory,
    setShowGitHubActivity,
    setSelectedPriority,
    setSelectedStatus,
  });
  useProjectWorkspaceAutoSync({
    project,
    ...(tickets.length > 0 || jiraLastCheckedAt !== undefined ? { projectTickets: tickets } : {}),
    githubActivityItems: githubActivity.activityItems,
    ...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {}),
    ...(githubActivity.lastCheckedAt !== undefined
      ? { githubLastCheckedAt: githubActivity.lastCheckedAt }
      : {}),
    uiState: {
      surface: "my-work",
      query,
      viewMode,
      groupMode,
      statusCategory,
      showGitHubActivity,
      hiddenKanbanColumnIds,
      excludedTypeKeys,
      selectedPriority,
      selectedStatus,
      tableSortBy,
      tableSortDirection,
      visibleWorkItemCount: filteredWorkItems.length,
    },
  });

  return (
    <div className="space-y-6">
      <section>
        <ProjectMyWorkFilterBar
          query={query}
          onQueryChange={setQuery}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          groupMode={groupMode}
          onGroupModeChange={setGroupMode}
          statusCategory={statusCategory}
          onStatusCategoryChange={setStatusCategory}
          activeOptionsCount={activeOptionsCount}
          showGitHubActivity={showGitHubActivity}
          onShowGitHubActivityChange={setShowGitHubActivity}
          hiddenKanbanColumnIds={hiddenKanbanColumnIds}
          onKanbanLaneVisibilityChange={toggleKanbanLaneVisibility}
          epicsHidden={epicsHidden}
          onEpicsHiddenChange={setEpicsHidden}
          excludedTypeKeys={excludedTypeKeys}
          onTypeVisibilityChange={toggleTypeVisibility}
          typeOptions={typeOptions}
          kanbanLaneOptions={kanbanLaneOptions}
          selectedPriority={selectedPriority}
          onSelectedPriorityChange={setSelectedPriority}
          priorityOptions={priorityOptions}
          selectedStatus={selectedStatus}
          onSelectedStatusChange={setSelectedStatus}
          statusOptions={statusOptions}
          tableSortBy={tableSortBy}
          onTableSortByChange={setTableSortBy}
          tableSortDirection={tableSortDirection}
          onTableSortDirectionChange={setTableSortDirection}
          onReset={resetOptionsFilters}
        />

        <ProjectMyWorkContent
          loading={loading}
          project={project}
          tickets={tickets}
          assignedWorkItems={assignedWorkItems}
          filteredWorkItems={filteredWorkItems}
          visibleHierarchy={visibleHierarchy}
          viewMode={viewMode}
          groupMode={groupMode}
          showGitHubActivity={showGitHubActivity}
          tableSortBy={tableSortBy}
          tableSortDirection={tableSortDirection}
          kanbanColumns={kanbanColumns}
          parentChildGroups={parentChildGroups}
          githubActivityByWorkItem={githubActivity.activityByWorkItem}
          {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
          {...(githubActivity.lastCheckedAt !== undefined
            ? { githubLastCheckedAt: githubActivity.lastCheckedAt }
            : {})}
          onTableSortByChange={setTableSortBy}
          onTableSortDirectionChange={setTableSortDirection}
          {...(canMoveTickets ? { onMoveTicketToStatus: moveTicketToStatus } : {})}
          onOpenTicket={onOpenTicket}
          onRefresh={reloadTickets}
          onClearFilters={() => {
            setQuery("");
            resetOptionsFilters();
          }}
        />
      </section>

      <section>
        <ProjectDashboardUnmatchedActivity project={project} githubActivity={githubActivity} />
      </section>

      {githubActivity.loading ? (
        <p className="text-[11px] text-muted-foreground">Refreshing GitHub activity...</p>
      ) : null}
    </div>
  );
}
