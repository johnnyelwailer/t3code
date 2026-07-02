/**
 * The backlog dashboard overview/filter bar wired to dashboard state — search,
 * assignee/issue-type/focus filters, saved filters, view mode, table grouping/
 * sort/columns, board+sprint selection, and refresh. Most props are
 * `setBacklogState` updaters lifted here to keep the View component lean. Split
 * out of t3work-ProjectDashboardBacklogView.tsx.
 */

import { ProjectBacklogOverview } from "~/t3work/t3work-ProjectBacklogOverview";
import type { useProjectDashboardBacklogState } from "~/t3work/hooks/t3work-useProjectDashboardBacklogState";

type BacklogStateApi = ReturnType<typeof useProjectDashboardBacklogState>;
type OverviewProps = React.ComponentProps<typeof ProjectBacklogOverview>;

export function ProjectDashboardBacklogOverviewSection({
  backlogState,
  setBacklogState,
  loading,
  assigneeOptions,
  labelOptions,
  savedFilters,
  quickFilters,
  boards,
  sprints,
  onTableSortByChange,
  onTableSortDirectionChange,
  onVisibleTableColumnsChange,
  onCollapseTableGroups,
  onExpandTableGroups,
  onRefreshData,
}: {
  backlogState: BacklogStateApi["state"];
  setBacklogState: BacklogStateApi["setState"];
  loading: boolean;
  assigneeOptions: OverviewProps["assigneeOptions"];
  labelOptions: OverviewProps["labelOptions"];
  savedFilters: OverviewProps["savedFilters"];
  quickFilters: OverviewProps["quickFilters"];
  boards: OverviewProps["boards"];
  sprints: OverviewProps["sprints"];
  onTableSortByChange: OverviewProps["onTableSortByChange"];
  onTableSortDirectionChange: OverviewProps["onTableSortDirectionChange"];
  onVisibleTableColumnsChange: OverviewProps["onVisibleTableColumnsChange"];
  onCollapseTableGroups: OverviewProps["onCollapseTableGroups"];
  onExpandTableGroups: OverviewProps["onExpandTableGroups"];
  onRefreshData: OverviewProps["onRefreshData"];
}) {
  return (
    <ProjectBacklogOverview
      loading={loading}
      query={backlogState.query}
      onQueryChange={(query) => setBacklogState((current) => ({ ...current, query }))}
      assigneeFilter={backlogState.assigneeFilter}
      onAssigneeFilterChange={(assigneeFilter) =>
        setBacklogState((current) => ({ ...current, assigneeFilter }))
      }
      assigneeFilterScope={backlogState.assigneeFilterScope}
      onAssigneeFilterScopeChange={(assigneeFilterScope) =>
        setBacklogState((current) => ({ ...current, assigneeFilterScope }))
      }
      visibleIssueTypes={backlogState.visibleIssueTypes}
      onVisibleIssueTypesChange={(visibleIssueTypes) =>
        setBacklogState((current) => ({ ...current, visibleIssueTypes }))
      }
      selectedLabels={backlogState.selectedLabels}
      onSelectedLabelsChange={(selectedLabels) =>
        setBacklogState((current) => ({ ...current, selectedLabels }))
      }
      assigneeOptions={assigneeOptions}
      labelOptions={labelOptions}
      savedFilters={savedFilters}
      selectedFilterId={backlogState.filterId}
      onFilterChange={(filterId) => setBacklogState((current) => ({ ...current, filterId }))}
      quickFilters={quickFilters}
      selectedQuickFilterIds={backlogState.selectedQuickFilterIds}
      onSelectedQuickFilterIdsChange={(selectedQuickFilterIds) =>
        setBacklogState((current) => ({ ...current, selectedQuickFilterIds }))
      }
      viewMode={backlogState.viewMode}
      onViewModeChange={(viewMode) => setBacklogState((current) => ({ ...current, viewMode }))}
      focusFilter={backlogState.focusFilter}
      onFocusFilterChange={(focusFilter) =>
        setBacklogState((current) => ({ ...current, focusFilter }))
      }
      tableGroupBy={backlogState.tableGroupBy}
      onTableGroupByChange={(tableGroupBy) =>
        setBacklogState((current) => ({ ...current, tableGroupBy }))
      }
      tableSortBy={backlogState.tableSortBy}
      onTableSortByChange={onTableSortByChange}
      tableSortDirection={backlogState.tableSortDirection}
      onTableSortDirectionChange={onTableSortDirectionChange}
      visibleTableColumns={backlogState.visibleTableColumns}
      onVisibleTableColumnsChange={onVisibleTableColumnsChange}
      onCollapseTableGroups={onCollapseTableGroups}
      onExpandTableGroups={onExpandTableGroups}
      boards={boards}
      sprints={sprints}
      selectedBoardId={backlogState.boardId}
      selectedSprintId={backlogState.sprintId}
      onBoardChange={(boardId) =>
        setBacklogState((current) => ({ ...current, boardId, sprintId: undefined }))
      }
      onSprintChange={(sprintId) => setBacklogState((current) => ({ ...current, sprintId }))}
      onRefreshData={onRefreshData}
    />
  );
}
