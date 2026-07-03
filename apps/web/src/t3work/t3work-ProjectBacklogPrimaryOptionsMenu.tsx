import type {
  AtlassianBacklogBoard,
  AtlassianBacklogSprint,
} from "~/t3work/backend/t3work-types";
import {
  MenuGroup,
  MenuGroupLabel,
  MenuCheckboxItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "~/t3work/components/ui/t3work-menu";
import { ProjectBacklogOptionsJiraFilters } from "~/t3work/t3work-ProjectBacklogOptionsJiraFilters";
import type { ProjectBacklogViewMode } from "~/t3work/t3work-projectBacklogPresentation";
import { projectBacklogViewModes } from "~/t3work/t3work-projectBacklogPresentation";
import type {
  ProjectBacklogFocusFilter,
  ProjectBacklogIssueTypeFilterKey,
} from "~/t3work/t3work-projectBacklogUtils";
import { projectBacklogIssueTypeFilterOptions } from "~/t3work/t3work-projectBacklogUtils";
import {
  getSelectedBacklogOptionLabel,
  menuShortcutClassName,
  menuSubPopupClassName,
  projectBacklogFocusFilterOptions,
  radioItemClassName,
  singleColumnRadioGroupClassName,
  twoColumnRadioGroupClassName,
} from "~/t3work/t3work-ProjectBacklogOptionsMenuMeta";

export function ProjectBacklogPrimaryOptionsMenu({
  viewMode,
  onViewModeChange,
  focusFilter,
  onFocusFilterChange,
  visibleIssueTypes,
  onVisibleIssueTypesChange,
  boards,
  sprints,
  selectedBoardId,
  selectedSprintId,
  onBoardChange,
  onSprintChange,
}: {
  viewMode: ProjectBacklogViewMode;
  onViewModeChange: (value: ProjectBacklogViewMode) => void;
  focusFilter: ProjectBacklogFocusFilter;
  onFocusFilterChange: (value: ProjectBacklogFocusFilter) => void;
  visibleIssueTypes: ReadonlyArray<ProjectBacklogIssueTypeFilterKey>;
  onVisibleIssueTypesChange: (value: ReadonlyArray<ProjectBacklogIssueTypeFilterKey>) => void;
  boards: ReadonlyArray<AtlassianBacklogBoard>;
  sprints: ReadonlyArray<AtlassianBacklogSprint>;
  selectedBoardId: string | undefined;
  selectedSprintId: string | undefined;
  onBoardChange: (boardId: string) => void;
  onSprintChange: (sprintId: string | undefined) => void;
}) {
  const selectedViewLabel = getSelectedBacklogOptionLabel(projectBacklogViewModes, viewMode);
  const selectedFilterLabel = getSelectedBacklogOptionLabel(
    projectBacklogFocusFilterOptions,
    focusFilter,
  );
  const selectedIssueTypeLabel =
    visibleIssueTypes.length === projectBacklogIssueTypeFilterOptions.length
      ? "All"
      : `${visibleIssueTypes.length} shown`;

  function toggleIssueType(value: ProjectBacklogIssueTypeFilterKey, checked: boolean) {
    const next = checked
      ? projectBacklogIssueTypeFilterOptions
          .map((option) => option.value)
          .filter((optionValue) => optionValue === value || visibleIssueTypes.includes(optionValue))
      : visibleIssueTypes.filter((optionValue) => optionValue !== value);

    if (next.length > 0) {
      onVisibleIssueTypesChange(next);
    }
  }

  return (
    <>
      <MenuGroup>
        <MenuGroupLabel>Display</MenuGroupLabel>

        <MenuSub>
          <MenuSubTrigger className={radioItemClassName}>
            View
            {selectedViewLabel ? (
              <MenuShortcut className={menuShortcutClassName}>{selectedViewLabel}</MenuShortcut>
            ) : null}
          </MenuSubTrigger>
          <MenuSubPopup className={menuSubPopupClassName}>
            <MenuRadioGroup
              className={twoColumnRadioGroupClassName}
              value={viewMode}
              onValueChange={(value) => onViewModeChange(value as ProjectBacklogViewMode)}
            >
              {projectBacklogViewModes.map((option) => (
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
            Filter
            {selectedFilterLabel ? (
              <MenuShortcut className={menuShortcutClassName}>{selectedFilterLabel}</MenuShortcut>
            ) : null}
          </MenuSubTrigger>
          <MenuSubPopup className={menuSubPopupClassName}>
            <MenuRadioGroup
              className={singleColumnRadioGroupClassName}
              value={focusFilter}
              onValueChange={(value) => onFocusFilterChange(value as ProjectBacklogFocusFilter)}
            >
              {projectBacklogFocusFilterOptions.map((option) => (
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
            Issue types
            <MenuShortcut className={menuShortcutClassName}>{selectedIssueTypeLabel}</MenuShortcut>
          </MenuSubTrigger>
          <MenuSubPopup className={menuSubPopupClassName}>
            <MenuGroup>
              {projectBacklogIssueTypeFilterOptions.map((option) => (
                <MenuCheckboxItem
                  key={option.value}
                  checked={visibleIssueTypes.includes(option.value)}
                  className={radioItemClassName}
                  onCheckedChange={(checked) => toggleIssueType(option.value, Boolean(checked))}
                >
                  {option.label}
                </MenuCheckboxItem>
              ))}
            </MenuGroup>
          </MenuSubPopup>
        </MenuSub>
      </MenuGroup>

      <MenuSeparator />

      <MenuGroup>
        <MenuGroupLabel>Jira</MenuGroupLabel>
        <ProjectBacklogOptionsJiraFilters
          boards={boards}
          sprints={sprints}
          selectedBoardId={selectedBoardId}
          selectedSprintId={selectedSprintId}
          onBoardChange={onBoardChange}
          onSprintChange={onSprintChange}
        />
      </MenuGroup>
    </>
  );
}
