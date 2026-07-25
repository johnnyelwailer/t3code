/* oxlint-disable react/no-object-type-as-default-prop -- Existing merged lint debt; keep green while preserving behavior. */
import { Loader2 } from "lucide-react";

import type {
  AtlassianBacklogBoard,
  AtlassianBacklogSavedFilter,
  AtlassianBacklogSprint,
} from "~/t3team/backend/t3team-types";
import type { AtlassianBacklogQuickFilter } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { Input } from "~/t3team/components/ui/t3team-input";
import { ProjectBacklogOverviewAssigneeFilter } from "~/t3team/t3team-ProjectBacklogOverviewAssigneeFilter";
import { ProjectBacklogOverviewJiraFiltersMenu } from "~/t3team/t3team-ProjectBacklogOverviewJiraFiltersMenu";
import { ProjectBacklogOverviewLabelsFilter } from "~/t3team/t3team-ProjectBacklogOverviewLabelsFilter";
import { ProjectBacklogOverviewViewSwitch } from "~/t3team/t3team-ProjectBacklogOverviewViewSwitch";
import { ProjectBacklogOptionsMenu } from "~/t3team/t3team-ProjectBacklogOptionsMenu";
import type { ProjectBacklogViewMode } from "~/t3team/t3team-projectBacklogPresentation";
import type {
  ProjectBacklogTableColumnId,
  ProjectBacklogTableGroupBy,
  ProjectBacklogTableSortBy,
  ProjectBacklogTableSortDirection,
} from "~/t3team/t3team-projectBacklogTable";
import type {
  ProjectBacklogAssigneeFilterOption,
  ProjectBacklogAssigneeFilterScope,
  ProjectBacklogFocusFilter,
  ProjectBacklogIssueTypeFilterKey,
  ProjectBacklogLabelFilterOption,
} from "~/t3team/t3team-projectBacklogUtils";

export interface ProjectBacklogOverviewFiltersProps {
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (value: string) => void;
  assigneeFilterScope: ProjectBacklogAssigneeFilterScope;
  onAssigneeFilterScopeChange: (value: ProjectBacklogAssigneeFilterScope) => void;
  visibleIssueTypes: ReadonlyArray<ProjectBacklogIssueTypeFilterKey>;
  onVisibleIssueTypesChange: (value: ReadonlyArray<ProjectBacklogIssueTypeFilterKey>) => void;
  selectedLabels: ReadonlyArray<string>;
  onSelectedLabelsChange: (value: ReadonlyArray<string>) => void;
  assigneeOptions: ReadonlyArray<ProjectBacklogAssigneeFilterOption>;
  labelOptions: ReadonlyArray<ProjectBacklogLabelFilterOption>;
  savedFilters: ReadonlyArray<AtlassianBacklogSavedFilter>;
  selectedFilterId: string | undefined;
  onFilterChange: (filterId: string | undefined) => void;
  quickFilters: ReadonlyArray<AtlassianBacklogQuickFilter>;
  selectedQuickFilterIds: ReadonlyArray<string>;
  onSelectedQuickFilterIdsChange: (value: ReadonlyArray<string>) => void;
  viewMode: ProjectBacklogViewMode;
  onViewModeChange: (value: ProjectBacklogViewMode) => void;
  focusFilter: ProjectBacklogFocusFilter;
  onFocusFilterChange: (value: ProjectBacklogFocusFilter) => void;
  tableGroupBy: ProjectBacklogTableGroupBy;
  onTableGroupByChange: (value: ProjectBacklogTableGroupBy) => void;
  tableSortBy: ProjectBacklogTableSortBy;
  onTableSortByChange: (value: ProjectBacklogTableSortBy) => void;
  tableSortDirection: ProjectBacklogTableSortDirection;
  onTableSortDirectionChange: (value: ProjectBacklogTableSortDirection) => void;
  visibleTableColumns: ReadonlyArray<ProjectBacklogTableColumnId>;
  onVisibleTableColumnsChange: (value: ReadonlyArray<ProjectBacklogTableColumnId>) => void;
  onCollapseTableGroups: () => void;
  onExpandTableGroups: () => void;
  boards: ReadonlyArray<AtlassianBacklogBoard>;
  sprints: ReadonlyArray<AtlassianBacklogSprint>;
  selectedBoardId: string | undefined;
  selectedSprintId: string | undefined;
  onBoardChange: (boardId: string) => void;
  onSprintChange: (sprintId: string | undefined) => void;
  onRefreshData: () => void;
}

export function ProjectBacklogOverviewFilters({
  loading,
  query,
  onQueryChange,
  assigneeFilter,
  onAssigneeFilterChange,
  assigneeFilterScope,
  onAssigneeFilterScopeChange,
  visibleIssueTypes,
  onVisibleIssueTypesChange,
  selectedLabels,
  onSelectedLabelsChange,
  assigneeOptions = [],
  labelOptions = [],
  savedFilters = [],
  selectedFilterId,
  onFilterChange,
  quickFilters = [],
  selectedQuickFilterIds = [],
  onSelectedQuickFilterIdsChange,
  viewMode,
  onViewModeChange,
  focusFilter,
  onFocusFilterChange,
  tableGroupBy,
  onTableGroupByChange,
  tableSortBy,
  onTableSortByChange,
  tableSortDirection,
  onTableSortDirectionChange,
  visibleTableColumns,
  onVisibleTableColumnsChange,
  onCollapseTableGroups,
  onExpandTableGroups,
  boards = [],
  sprints = [],
  selectedBoardId,
  selectedSprintId,
  onBoardChange,
  onSprintChange,
  onRefreshData,
}: ProjectBacklogOverviewFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search issues"
        className="h-8 w-full border-border/80 bg-background/95 text-xs sm:w-[13rem] lg:w-[15rem]"
      />

      <ProjectBacklogOverviewAssigneeFilter
        value={assigneeFilter}
        onValueChange={onAssigneeFilterChange}
        scope={assigneeFilterScope}
        onScopeChange={onAssigneeFilterScopeChange}
        options={assigneeOptions}
      />

      <ProjectBacklogOverviewLabelsFilter
        value={selectedLabels}
        onValueChange={onSelectedLabelsChange}
        options={labelOptions}
      />

      <ProjectBacklogOverviewJiraFiltersMenu
        quickFilters={quickFilters}
        selectedQuickFilterIds={selectedQuickFilterIds}
        onSelectedQuickFilterIdsChange={onSelectedQuickFilterIdsChange}
        savedFilters={savedFilters}
        selectedFilterId={selectedFilterId}
        onFilterChange={onFilterChange}
        focusFilter={focusFilter}
        onFocusFilterChange={onFocusFilterChange}
      />

      <div className="ml-auto flex items-center gap-2">
        {loading ? (
          <div
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
          >
            <Loader2 className="size-3 animate-spin" />
            <span>Updating backlog…</span>
          </div>
        ) : null}
        <ProjectBacklogOverviewViewSwitch viewMode={viewMode} onViewModeChange={onViewModeChange} />
        <ProjectBacklogOptionsMenu
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          visibleIssueTypes={visibleIssueTypes}
          onVisibleIssueTypesChange={onVisibleIssueTypesChange}
          tableGroupBy={tableGroupBy}
          onTableGroupByChange={onTableGroupByChange}
          tableSortBy={tableSortBy}
          onTableSortByChange={onTableSortByChange}
          tableSortDirection={tableSortDirection}
          onTableSortDirectionChange={onTableSortDirectionChange}
          visibleTableColumns={visibleTableColumns}
          onVisibleTableColumnsChange={onVisibleTableColumnsChange}
          onCollapseTableGroups={onCollapseTableGroups}
          onExpandTableGroups={onExpandTableGroups}
          boards={boards}
          sprints={sprints}
          selectedBoardId={selectedBoardId}
          selectedSprintId={selectedSprintId}
          onBoardChange={onBoardChange}
          onSprintChange={onSprintChange}
          loading={loading}
          onRefreshData={onRefreshData}
        />
      </div>
    </div>
  );
}
