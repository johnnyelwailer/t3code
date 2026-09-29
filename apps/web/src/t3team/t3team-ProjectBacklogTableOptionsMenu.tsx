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
import {
  projectBacklogTableColumnOptions,
  projectBacklogTableGroupOptions,
  projectBacklogTableSortOptions,
  type ProjectBacklogTableColumnId,
  type ProjectBacklogTableGroupBy,
  type ProjectBacklogTableSortBy,
  type ProjectBacklogTableSortDirection,
} from "~/t3team/t3team-projectBacklogTable";
import {
  getSelectedBacklogOptionLabel,
  menuValueClassName,
} from "~/t3team/t3team-ProjectBacklogOptionsMenuMeta";

export function ProjectBacklogTableOptionsMenu({
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
}: {
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
}) {
  const selectedTableGroupLabel = getSelectedBacklogOptionLabel(
    projectBacklogTableGroupOptions,
    tableGroupBy,
  );
  const selectedTableSortLabel = getSelectedBacklogOptionLabel(
    projectBacklogTableSortOptions,
    tableSortBy,
  );
  const selectedVisibleColumnsLabel =
    visibleTableColumns.length === 0 ? "Issue only" : `${visibleTableColumns.length} shown`;

  function toggleVisibleColumn(columnId: ProjectBacklogTableColumnId, checked: boolean) {
    const nextVisibleColumns = checked
      ? projectBacklogTableColumnOptions
          .map((option) => option.value)
          .filter((value) => value === columnId || visibleTableColumns.includes(value))
      : visibleTableColumns.filter((value) => value !== columnId);

    onVisibleTableColumnsChange(nextVisibleColumns);
  }

  return (
    <>
      <MenuSeparator />

      <MenuGroup>
        <MenuGroupLabel>Table</MenuGroupLabel>

        <MenuSub>
          <MenuSubTrigger>
            Visible columns
            <span className={menuValueClassName}>{selectedVisibleColumnsLabel}</span>
          </MenuSubTrigger>
          <MenuSubPopup className="min-w-60">
            <MenuGroup>
              <MenuGroupLabel className="max-w-56">
                Issue and row actions always stay visible.
              </MenuGroupLabel>
              {projectBacklogTableColumnOptions.map((option) => (
                <MenuCheckboxItem
                  key={option.value}
                  checked={visibleTableColumns.includes(option.value)}
                  onCheckedChange={(checked) => toggleVisibleColumn(option.value, Boolean(checked))}
                >
                  {option.label}
                </MenuCheckboxItem>
              ))}
            </MenuGroup>
          </MenuSubPopup>
        </MenuSub>

        <MenuSub>
          <MenuSubTrigger>
            Group rows
            {selectedTableGroupLabel ? (
              <span className={menuValueClassName}>{selectedTableGroupLabel}</span>
            ) : null}
          </MenuSubTrigger>
          <MenuSubPopup className="min-w-60">
            <MenuRadioGroup
              value={tableGroupBy}
              onValueChange={(value) => onTableGroupByChange(value as ProjectBacklogTableGroupBy)}
            >
              {projectBacklogTableGroupOptions.map((option) => (
                <MenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>

        <MenuSub>
          <MenuSubTrigger>
            Sort rows
            {selectedTableSortLabel ? (
              <span className={menuValueClassName}>{selectedTableSortLabel}</span>
            ) : null}
          </MenuSubTrigger>
          <MenuSubPopup className="min-w-60">
            <MenuRadioGroup
              value={tableSortBy}
              onValueChange={(value) => onTableSortByChange(value as ProjectBacklogTableSortBy)}
            >
              {projectBacklogTableSortOptions.map((option) => (
                <MenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>

        <MenuItem
          onClick={() => onTableSortDirectionChange(tableSortDirection === "asc" ? "desc" : "asc")}
        >
          Sort direction
          <span className={menuValueClassName}>
            {tableSortDirection === "asc" ? "Ascending" : "Descending"}
          </span>
        </MenuItem>
      </MenuGroup>

      <MenuSeparator />

      <MenuGroup>
        <MenuGroupLabel>Rows</MenuGroupLabel>
        <MenuItem onClick={onCollapseTableGroups}>Collapse groups</MenuItem>
        <MenuItem onClick={onExpandTableGroups}>Expand groups</MenuItem>
      </MenuGroup>
    </>
  );
}
