import {
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "~/t3team/components/ui/t3team-menu";
import { ProjectMyWorkOptionsMenuLanesSub } from "~/t3team/t3team-ProjectMyWorkOptionsMenuLanesSub";
import { ProjectMyWorkOptionsMenuSortItems } from "~/t3team/t3team-ProjectMyWorkOptionsMenuSortItems";
import type { ProjectMyWorkStatusCategory } from "~/t3team/t3team-projectMyWork";
import type { ProjectMyWorkViewMode } from "~/t3team/t3team-projectDashboardMyWorkState";
import { getProjectMyWorkLensOptions } from "~/t3team/t3team-projectMyWorkLensOptions";
import type { ProjectMyWorkOptionsMenuProps } from "~/t3team/t3team-projectMyWorkOptionsMenuTypes";

/**
 * The view half of the options menu. Each control is gated on the active lens (see
 * `getProjectMyWorkLensOptions`): status focus and "Hide epics" filter every lens, the rest only
 * appear where they change what is on screen.
 */
export function ProjectMyWorkOptionsMenuViewSection({
  lens,
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
  | "lens"
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
  const available = getProjectMyWorkLensOptions(lens);
  return (
    <>
      <MenuGroup>
        <MenuGroupLabel>View</MenuGroupLabel>

        {available.viewMode ? (
          <MenuSub>
            <MenuSubTrigger>Layout</MenuSubTrigger>
            <MenuSubPopup className="min-w-56">
              <MenuRadioGroup
                value={viewMode === "grid" ? "grid" : "list"}
                onValueChange={(value) => onViewModeChange(value as ProjectMyWorkViewMode)}
              >
                <MenuRadioItem value="list">List</MenuRadioItem>
                <MenuRadioItem value="grid">Cards</MenuRadioItem>
              </MenuRadioGroup>
            </MenuSubPopup>
          </MenuSub>
        ) : null}

        {available.grouping ? (
          <MenuSub>
            <MenuSubTrigger>Grouping</MenuSubTrigger>
            <MenuSubPopup className="min-w-56">
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
          <MenuSubPopup className="min-w-56">
            <MenuRadioGroup
              value={statusCategory}
              onValueChange={(value) =>
                onStatusCategoryChange(value as ProjectMyWorkStatusCategory)
              }
            >
              {/* The list lens hides Done until a status is asked for (shouldHideDoneWork). */}
              <MenuRadioItem value="all">
                {lens === "hierarchy" ? "Open work" : "All work"}
              </MenuRadioItem>
              <MenuRadioItem value="active">Active</MenuRadioItem>
              <MenuRadioItem value="review">Review</MenuRadioItem>
              <MenuRadioItem value="done">Done</MenuRadioItem>
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>

        {available.sort ? (
          <ProjectMyWorkOptionsMenuSortItems
            tableSortBy={tableSortBy}
            onTableSortByChange={onTableSortByChange}
            tableSortDirection={tableSortDirection}
            onTableSortDirectionChange={onTableSortDirectionChange}
          />
        ) : null}
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

      {available.kanbanLanes ? (
        <>
          <MenuSeparator />
          <ProjectMyWorkOptionsMenuLanesSub
            hiddenKanbanColumnIds={hiddenKanbanColumnIds}
            onKanbanLaneVisibilityChange={onKanbanLaneVisibilityChange}
            kanbanLaneOptions={kanbanLaneOptions}
          />
        </>
      ) : null}

      <MenuSeparator />
    </>
  );
}
