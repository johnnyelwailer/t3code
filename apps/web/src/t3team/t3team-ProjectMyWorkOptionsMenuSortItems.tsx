import {
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "~/t3team/components/ui/t3team-menu";
import type { ProjectMyWorkOptionsMenuProps } from "~/t3team/t3team-projectMyWorkOptionsMenuTypes";

/** Sort order and direction, for the lenses that order their items (list, board). */
export function ProjectMyWorkOptionsMenuSortItems({
  tableSortBy,
  onTableSortByChange,
  tableSortDirection,
  onTableSortDirectionChange,
}: Pick<
  ProjectMyWorkOptionsMenuProps,
  "tableSortBy" | "onTableSortByChange" | "tableSortDirection" | "onTableSortDirectionChange"
>) {
  return (
    <>
      <MenuSub>
        <MenuSubTrigger>Sort items</MenuSubTrigger>
        <MenuSubPopup className="min-w-56">
          <MenuRadioGroup value={tableSortBy} onValueChange={onTableSortByChange}>
            <MenuRadioItem value="updated">Last updated</MenuRadioItem>
            <MenuRadioItem value="title">Title</MenuRadioItem>
            <MenuRadioItem value="status">Status</MenuRadioItem>
            <MenuRadioItem value="assignee">Owner</MenuRadioItem>
          </MenuRadioGroup>
        </MenuSubPopup>
      </MenuSub>

      <MenuItem
        onClick={() => onTableSortDirectionChange(tableSortDirection === "asc" ? "desc" : "asc")}
      >
        Sort direction
        <span className="ml-auto text-2xs text-muted-foreground">
          {tableSortDirection === "asc" ? "Ascending" : "Descending"}
        </span>
      </MenuItem>
    </>
  );
}
