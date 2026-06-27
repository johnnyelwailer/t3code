/* oxlint-disable react/no-object-type-as-default-prop -- Existing merged lint debt; keep green while preserving behavior. */
import { Loader2, Orbit, Table2 } from "lucide-react";

import { planningSpaceEnabled } from "~/t3work/planning-space/t3work-planningSpaceFlag";

import type {
  AtlassianBacklogBoard,
  AtlassianBacklogSavedFilter,
  AtlassianBacklogSprint,
} from "~/t3work/backend/t3work-types";
import { Input } from "~/t3work/components/ui/t3work-input";
import { ProjectBacklogOverviewAssigneeFilter } from "~/t3work/t3work-ProjectBacklogOverviewAssigneeFilter";
import { ProjectBacklogOptionsMenu } from "~/t3work/t3work-ProjectBacklogOptionsMenu";
import type { ProjectBacklogViewMode } from "~/t3work/t3work-projectBacklogPresentation";
import type {
  ProjectBacklogTableColumnId,
  ProjectBacklogTableGroupBy,
  ProjectBacklogTableSortBy,
  ProjectBacklogTableSortDirection,
} from "~/t3work/t3work-projectBacklogTable";
import type {
  ProjectBacklogAssigneeFilterOption,
  ProjectBacklogAssigneeFilterScope,
  ProjectBacklogFocusFilter,
  ProjectBacklogIssueTypeFilterKey,
} from "~/t3work/t3work-projectBacklogUtils";

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
  assigneeOptions: ReadonlyArray<ProjectBacklogAssigneeFilterOption>;
  savedFilters: ReadonlyArray<AtlassianBacklogSavedFilter>;
  selectedFilterId: string | undefined;
  onFilterChange: (filterId: string | undefined) => void;
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
  assigneeOptions = [],
  savedFilters = [],
  selectedFilterId,
  onFilterChange,
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
        {planningSpaceEnabled ? (
          <div
            className="inline-flex items-center rounded-md border border-border/70 bg-background/90"
            role="group"
            aria-label="Quick view switch"
          >
            <button
              type="button"
              aria-label="Table view"
              aria-pressed={viewMode === "table"}
              onClick={() => onViewModeChange("table")}
              className={`inline-flex size-8 items-center justify-center rounded-l-md transition-colors ${
                viewMode === "table"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Table2 className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Planning space view"
              aria-pressed={viewMode === "planning-space"}
              onClick={() => onViewModeChange("planning-space")}
              className={`inline-flex size-8 items-center justify-center rounded-r-md transition-colors ${
                viewMode === "planning-space"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Orbit className="size-4" />
            </button>
          </div>
        ) : null}
        <ProjectBacklogOptionsMenu
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          focusFilter={focusFilter}
          onFocusFilterChange={onFocusFilterChange}
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
          savedFilters={savedFilters}
          selectedBoardId={selectedBoardId}
          selectedSprintId={selectedSprintId}
          selectedFilterId={selectedFilterId}
          onBoardChange={onBoardChange}
          onSprintChange={onSprintChange}
          onFilterChange={onFilterChange}
          loading={loading}
          onRefreshData={onRefreshData}
        />
      </div>
    </div>
  );
}
