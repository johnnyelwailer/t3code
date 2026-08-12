import {
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "~/t3team/components/ui/t3team-menu";
import type { ProjectMyWorkStatusCategory } from "~/t3team/t3team-projectMyWork";
import type { ProjectMyWorkViewMode } from "~/t3team/t3team-projectDashboardMyWorkState";
import type { ProjectMyWorkOptionsMenuProps } from "~/t3team/t3team-projectMyWorkOptionsMenuTypes";

export function ProjectMyWorkOptionsMenuViewSection({
  viewMode,
  onViewModeChange,
  groupMode,
  onGroupModeChange,
  statusCategory,
  onStatusCategoryChange,
  epicsHidden,
  onEpicsHiddenChange,
  hiddenKanbanColumnIds,
  onKanbanLaneVisibilityChange,
  kanbanLaneOptions,
  tableSortBy,
  onTableSortByChange,
  tableSortDirection,
  onTableSortDirectionChange,
}: Pick<
  ProjectMyWorkOptionsMenuProps,
  | "viewMode"
  | "onViewModeChange"
  | "groupMode"
  | "onGroupModeChange"
  | "statusCategory"
  | "onStatusCategoryChange"
  | "epicsHidden"
  | "onEpicsHiddenChange"
  | "hiddenKanbanColumnIds"
  | "onKanbanLaneVisibilityChange"
  | "kanbanLaneOptions"
  | "tableSortBy"
  | "onTableSortByChange"
  | "tableSortDirection"
  | "onTableSortDirectionChange"
>) {
  return (
    <>
      <MenuGroup>
        <MenuGroupLabel>View</MenuGroupLabel>

        <MenuSub>
          <MenuSubTrigger>Mode</MenuSubTrigger>
          <MenuSubPopup className="min-w-[14rem] border-border/80 bg-background/95">
            <MenuRadioGroup
              value={viewMode}
              onValueChange={(value) => onViewModeChange(value as ProjectMyWorkViewMode)}
            >
              <MenuRadioItem value="table">Table</MenuRadioItem>
              <MenuRadioItem value="list">List</MenuRadioItem>
              <MenuRadioItem value="grid">Cards</MenuRadioItem>
              <MenuRadioItem value="kanban">Board</MenuRadioItem>
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>

        {viewMode !== "kanban" ? (
          <MenuSub>
            <MenuSubTrigger>Grouping</MenuSubTrigger>
            <MenuSubPopup className="min-w-[14rem] border-border/80 bg-background/95">
              <MenuRadioGroup
                value={groupMode}
                onValueChange={(value) => onGroupModeChange(value as "flat" | "hierarchy")}
              >
                <MenuRadioItem value="hierarchy">Hierarchy</MenuRadioItem>
                <MenuRadioItem value="flat">Flat</MenuRadioItem>
              </MenuRadioGroup>
            </MenuSubPopup>
          </MenuSub>
        ) : null}

        <MenuSub>
          <MenuSubTrigger>Status focus</MenuSubTrigger>
          <MenuSubPopup className="min-w-[14rem] border-border/80 bg-background/95">
            <MenuRadioGroup
              value={statusCategory}
              onValueChange={(value) =>
                onStatusCategoryChange(value as ProjectMyWorkStatusCategory)
              }
            >
              <MenuRadioItem value="all">All work</MenuRadioItem>
              <MenuRadioItem value="active">Active</MenuRadioItem>
              <MenuRadioItem value="review">Review</MenuRadioItem>
              <MenuRadioItem value="done">Done</MenuRadioItem>
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>

        <MenuSub>
          <MenuSubTrigger>Sort items</MenuSubTrigger>
          <MenuSubPopup className="min-w-[14rem] border-border/80 bg-background/95">
            <MenuRadioGroup value={tableSortBy} onValueChange={onTableSortByChange}>
              <MenuRadioItem value="updated">Last updated</MenuRadioItem>
              <MenuRadioItem value="title">Title</MenuRadioItem>
              <MenuRadioItem value="status">Status</MenuRadioItem>
              <MenuRadioItem value="assignee">Owner</MenuRadioItem>
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>

        <MenuItem
          className="min-h-8 rounded-md py-1.5 text-[12px]"
          onClick={() => onTableSortDirectionChange(tableSortDirection === "asc" ? "desc" : "asc")}
        >
          Sort direction
          <span className="ml-auto text-[11px] text-muted-foreground">
            {tableSortDirection === "asc" ? "Ascending" : "Descending"}
          </span>
        </MenuItem>
      </MenuGroup>

      <MenuSeparator />

      <MenuGroup>
        <MenuGroupLabel>Display</MenuGroupLabel>
        <MenuCheckboxItem
          checked={epicsHidden}
          variant="switch"
          onCheckedChange={(checked) => onEpicsHiddenChange(Boolean(checked))}
        >
          Hide epics
        </MenuCheckboxItem>
      </MenuGroup>

      {viewMode === "kanban" ? (
        <>
          <MenuSeparator />

          <MenuSub>
            <MenuSubTrigger>Status lanes</MenuSubTrigger>
            <MenuSubPopup className="min-w-[15rem] border-border/80 bg-background/95">
              <MenuGroup>
                <MenuGroupLabel>Visible lanes</MenuGroupLabel>
                {kanbanLaneOptions.length > 0 ? (
                  kanbanLaneOptions.map((option) => (
                    <MenuCheckboxItem
                      key={option.id}
                      checked={!hiddenKanbanColumnIds.includes(option.id)}
                      onCheckedChange={(checked) =>
                        onKanbanLaneVisibilityChange(option.id, Boolean(checked))
                      }
                    >
                      <span className="flex w-full items-center gap-2">
                        <span>{option.title}</span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {option.count}
                        </span>
                      </span>
                    </MenuCheckboxItem>
                  ))
                ) : (
                  <MenuItem disabled>No lanes available</MenuItem>
                )}
              </MenuGroup>
            </MenuSubPopup>
          </MenuSub>
        </>
      ) : null}

      <MenuSeparator />
    </>
  );
}
