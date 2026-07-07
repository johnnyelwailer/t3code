import { EllipsisIcon } from "lucide-react";
import type {
  AtlassianBacklogBoard,
  AtlassianBacklogSprint,
} from "~/t3work/backend/t3work-types";

import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/t3work/components/ui/t3work-menu";
import { ProjectBacklogPrimaryOptionsMenu } from "~/t3work/t3work-ProjectBacklogPrimaryOptionsMenu";
import { ProjectBacklogTableOptionsMenu } from "~/t3work/t3work-ProjectBacklogTableOptionsMenu";
import type { ProjectBacklogViewMode } from "~/t3work/t3work-projectBacklogPresentation";
import {
  type ProjectBacklogTableColumnId,
  type ProjectBacklogTableGroupBy,
  type ProjectBacklogTableSortBy,
  type ProjectBacklogTableSortDirection,
} from "~/t3work/t3work-projectBacklogTable";
import type { ProjectBacklogIssueTypeFilterKey } from "~/t3work/t3work-projectBacklogUtils";

export function ProjectBacklogOptionsMenu({
  viewMode,
  onViewModeChange,
  visibleIssueTypes,
  onVisibleIssueTypesChange,
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
  boards,
  sprints,
  selectedBoardId,
  selectedSprintId,
  onBoardChange,
  onSprintChange,
  loading,
  onRefreshData,
}: {
  viewMode: ProjectBacklogViewMode;
  onViewModeChange: (value: ProjectBacklogViewMode) => void;
  visibleIssueTypes: ReadonlyArray<ProjectBacklogIssueTypeFilterKey>;
  onVisibleIssueTypesChange: (value: ReadonlyArray<ProjectBacklogIssueTypeFilterKey>) => void;
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
  loading: boolean;
  onRefreshData: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        className="inline-flex size-8 items-center justify-center rounded-md border border-border/70 bg-background/90 text-muted-foreground transition-[border-color,background-color,color] hover:border-border hover:bg-accent/70 hover:text-foreground"
        aria-label="Backlog options"
      >
        <EllipsisIcon className="size-4" />
      </MenuTrigger>
      <MenuPopup
        align="end"
        side="bottom"
        className="min-w-[17rem] border-border/80 bg-background/95"
      >
        <MenuGroup>
          <MenuItem
            className="min-h-8 rounded-md py-1.5 text-[12px]"
            disabled={loading}
            onClick={onRefreshData}
          >
            Refresh data
          </MenuItem>
        </MenuGroup>

        <MenuSeparator />

        <ProjectBacklogPrimaryOptionsMenu
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          visibleIssueTypes={visibleIssueTypes}
          onVisibleIssueTypesChange={onVisibleIssueTypesChange}
          boards={boards}
          sprints={sprints}
          selectedBoardId={selectedBoardId}
          selectedSprintId={selectedSprintId}
          onBoardChange={onBoardChange}
          onSprintChange={onSprintChange}
        />

        {viewMode === "table" ? (
          <ProjectBacklogTableOptionsMenu
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
          />
        ) : null}
      </MenuPopup>
    </Menu>
  );
}
