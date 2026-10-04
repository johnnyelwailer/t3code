import { EllipsisIcon } from "lucide-react";
import type { AtlassianBacklogBoard, AtlassianBacklogSprint } from "~/t3team/backend/t3team-types";

import { Button } from "~/t3team/components/ui/t3team-button";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/t3team/components/ui/t3team-menu";
import { ProjectBacklogPrimaryOptionsMenu } from "~/t3team/t3team-ProjectBacklogPrimaryOptionsMenu";
import { ProjectBacklogTableOptionsMenu } from "~/t3team/t3team-ProjectBacklogTableOptionsMenu";
import type { ProjectBacklogViewMode } from "~/t3team/t3team-projectBacklogPresentation";
import {
  type ProjectBacklogTableColumnId,
  type ProjectBacklogTableGroupBy,
  type ProjectBacklogTableSortBy,
  type ProjectBacklogTableSortDirection,
} from "~/t3team/t3team-projectBacklogTable";
import type { ProjectBacklogIssueTypeFilterKey } from "~/t3team/t3team-projectBacklogUtils";

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
      <MenuTrigger render={<Button variant="outline" size="icon" />} aria-label="Backlog options">
        <EllipsisIcon className="size-4" />
      </MenuTrigger>
      <MenuPopup align="end" side="bottom" className="min-w-68">
        <MenuGroup>
          <MenuItem disabled={loading} onClick={onRefreshData}>
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
