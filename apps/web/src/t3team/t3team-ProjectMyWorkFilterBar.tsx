import { Input } from "~/t3team/components/ui/t3team-input";
import { ProjectMyWorkOptionsMenu } from "~/t3team/t3team-ProjectMyWorkOptionsMenu";
import type {
  ProjectMyWorkKanbanLaneOption,
  ProjectMyWorkTypeOption,
  ProjectMyWorkStatusCategory,
} from "~/t3team/t3team-projectMyWork";
import type {
  ProjectMyWorkTableSortBy,
  ProjectMyWorkTableSortDirection,
  ProjectMyWorkViewMode,
} from "~/t3team/t3team-projectDashboardMyWorkState";

export function ProjectMyWorkFilterBar({
  query,
  onQueryChange,
  viewMode,
  onViewModeChange,
  groupMode,
  onGroupModeChange,
  statusCategory,
  onStatusCategoryChange,
  activeOptionsCount,
  hiddenKanbanColumnIds,
  onKanbanLaneVisibilityChange,
  epicsHidden,
  onEpicsHiddenChange,
  excludedTypeKeys,
  onTypeVisibilityChange,
  typeOptions,
  kanbanLaneOptions,
  selectedPriority,
  onSelectedPriorityChange,
  priorityOptions,
  selectedStatus,
  onSelectedStatusChange,
  statusOptions,
  tableSortBy,
  onTableSortByChange,
  tableSortDirection,
  onTableSortDirectionChange,
  onReset,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  viewMode: ProjectMyWorkViewMode;
  onViewModeChange: (value: ProjectMyWorkViewMode) => void;
  groupMode: "flat" | "hierarchy";
  onGroupModeChange: (value: "flat" | "hierarchy") => void;
  statusCategory: ProjectMyWorkStatusCategory;
  onStatusCategoryChange: (value: ProjectMyWorkStatusCategory) => void;
  activeOptionsCount: number;
  hiddenKanbanColumnIds: ReadonlyArray<string>;
  onKanbanLaneVisibilityChange: (columnId: string, visible: boolean) => void;
  epicsHidden: boolean;
  onEpicsHiddenChange: (value: boolean) => void;
  excludedTypeKeys: ReadonlyArray<string>;
  onTypeVisibilityChange: (typeKey: string, visible: boolean) => void;
  typeOptions: ReadonlyArray<ProjectMyWorkTypeOption>;
  kanbanLaneOptions: ReadonlyArray<ProjectMyWorkKanbanLaneOption>;
  selectedPriority: string;
  onSelectedPriorityChange: (value: string) => void;
  priorityOptions: ReadonlyArray<string>;
  selectedStatus: string;
  onSelectedStatusChange: (value: string) => void;
  statusOptions: ReadonlyArray<string>;
  tableSortBy: ProjectMyWorkTableSortBy;
  onTableSortByChange: (value: ProjectMyWorkTableSortBy) => void;
  tableSortDirection: ProjectMyWorkTableSortDirection;
  onTableSortDirectionChange: (value: ProjectMyWorkTableSortDirection) => void;
  onReset: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1">
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search your assigned work"
        className="h-8 w-full border-border/80 bg-background/95 text-xs sm:w-[15rem] lg:w-[18rem]"
      />

      <div className="ml-auto flex items-center gap-2">
        <ProjectMyWorkOptionsMenu
          activeOptionsCount={activeOptionsCount}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          groupMode={groupMode}
          onGroupModeChange={onGroupModeChange}
          statusCategory={statusCategory}
          onStatusCategoryChange={onStatusCategoryChange}
          hiddenKanbanColumnIds={hiddenKanbanColumnIds}
          onKanbanLaneVisibilityChange={onKanbanLaneVisibilityChange}
          epicsHidden={epicsHidden}
          onEpicsHiddenChange={onEpicsHiddenChange}
          excludedTypeKeys={excludedTypeKeys}
          onTypeVisibilityChange={onTypeVisibilityChange}
          typeOptions={typeOptions}
          kanbanLaneOptions={kanbanLaneOptions}
          selectedPriority={selectedPriority}
          onSelectedPriorityChange={onSelectedPriorityChange}
          priorityOptions={priorityOptions}
          selectedStatus={selectedStatus}
          onSelectedStatusChange={onSelectedStatusChange}
          statusOptions={statusOptions}
          tableSortBy={tableSortBy}
          onTableSortByChange={onTableSortByChange}
          tableSortDirection={tableSortDirection}
          onTableSortDirectionChange={onTableSortDirectionChange}
          onReset={onReset}
        />
      </div>
    </div>
  );
}
