import {
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
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
  menuShortcutClassName,
  menuSubPopupClassName,
  radioItemClassName,
  singleColumnRadioGroupClassName,
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
          <MenuSubTrigger className={radioItemClassName}>
            Visible columns
            <MenuShortcut className={menuShortcutClassName}>
              {selectedVisibleColumnsLabel}
            </MenuShortcut>
          </MenuSubTrigger>
          <MenuSubPopup className={menuSubPopupClassName}>
            <MenuGroup>
              <MenuGroupLabel className="max-w-[14rem] leading-4">
                Issue and row actions always stay visible.
              </MenuGroupLabel>
              {projectBacklogTableColumnOptions.map((option) => (
                <MenuCheckboxItem
                  key={option.value}
                  checked={visibleTableColumns.includes(option.value)}
                  className={radioItemClassName}
                  onCheckedChange={(checked) => toggleVisibleColumn(option.value, Boolean(checked))}
                >
                  {option.label}
                </MenuCheckboxItem>
              ))}
            </MenuGroup>
          </MenuSubPopup>
        </MenuSub>

        <MenuSub>
          <MenuSubTrigger className={radioItemClassName}>
            Group rows
            {selectedTableGroupLabel ? (
              <MenuShortcut className={menuShortcutClassName}>
                {selectedTableGroupLabel}
              </MenuShortcut>
            ) : null}
          </MenuSubTrigger>
          <MenuSubPopup className={menuSubPopupClassName}>
            <MenuRadioGroup
              className={singleColumnRadioGroupClassName}
              value={tableGroupBy}
              onValueChange={(value) => onTableGroupByChange(value as ProjectBacklogTableGroupBy)}
            >
              {projectBacklogTableGroupOptions.map((option) => (
                <MenuRadioItem
                  key={option.value}
                  value={option.value}
                  className={radioItemClassName}
                >
                  {option.label}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>

        <MenuSub>
          <MenuSubTrigger className={radioItemClassName}>
            Sort rows
            {selectedTableSortLabel ? (
              <MenuShortcut className={menuShortcutClassName}>
                {selectedTableSortLabel}
              </MenuShortcut>
            ) : null}
          </MenuSubTrigger>
          <MenuSubPopup className={menuSubPopupClassName}>
            <MenuRadioGroup
              className={singleColumnRadioGroupClassName}
              value={tableSortBy}
              onValueChange={(value) => onTableSortByChange(value as ProjectBacklogTableSortBy)}
            >
              {projectBacklogTableSortOptions.map((option) => (
                <MenuRadioItem
                  key={option.value}
                  value={option.value}
                  className={radioItemClassName}
                >
                  {option.label}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>

        <MenuItem
          className={radioItemClassName}
          onClick={() => onTableSortDirectionChange(tableSortDirection === "asc" ? "desc" : "asc")}
        >
          Sort direction
          <MenuShortcut className={menuShortcutClassName}>
            {tableSortDirection === "asc" ? "Ascending" : "Descending"}
          </MenuShortcut>
        </MenuItem>
      </MenuGroup>

      <MenuSeparator />

      <MenuGroup>
        <MenuGroupLabel>Rows</MenuGroupLabel>
        <MenuItem className={radioItemClassName} onClick={onCollapseTableGroups}>
          Collapse groups
        </MenuItem>
        <MenuItem className={radioItemClassName} onClick={onExpandTableGroups}>
          Expand groups
        </MenuItem>
      </MenuGroup>
    </>
  );
}
