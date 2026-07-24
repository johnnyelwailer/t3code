import type {
  ProjectMyWorkTableSortBy,
  ProjectMyWorkTableSortDirection,
  ProjectMyWorkViewMode,
} from "~/t3team/t3team-projectDashboardMyWorkState";
import type {
  ProjectMyWorkKanbanLaneOption,
  ProjectMyWorkStatusCategory,
  ProjectMyWorkTypeOption,
} from "~/t3team/t3team-projectMyWork";

export interface ProjectMyWorkOptionsMenuProps {
  activeOptionsCount: number;
  viewMode: ProjectMyWorkViewMode;
  onViewModeChange: (value: ProjectMyWorkViewMode) => void;
  groupMode: "flat" | "hierarchy";
  onGroupModeChange: (value: "flat" | "hierarchy") => void;
  statusCategory: ProjectMyWorkStatusCategory;
  onStatusCategoryChange: (value: ProjectMyWorkStatusCategory) => void;
  showGitHubActivity: boolean;
  onShowGitHubActivityChange: (value: boolean) => void;
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
}
