import type { AtlassianBacklogBoard, AtlassianBacklogSprint } from "~/t3team/backend/t3team-types";
import {
  MenuGroup,
  MenuGroupLabel,
  MenuCheckboxItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "~/t3team/components/ui/t3team-menu";
import { ProjectBacklogOptionsJiraFilters } from "~/t3team/t3team-ProjectBacklogOptionsJiraFilters";
import type { ProjectBacklogViewMode } from "~/t3team/t3team-projectBacklogPresentation";
import { projectBacklogViewModes } from "~/t3team/t3team-projectBacklogPresentation";
import type { ProjectBacklogIssueTypeFilterKey } from "~/t3team/t3team-projectBacklogUtils";
import { projectBacklogIssueTypeFilterOptions } from "~/t3team/t3team-projectBacklogUtils";
import {
  getSelectedBacklogOptionLabel,
  menuValueClassName,
} from "~/t3team/t3team-ProjectBacklogOptionsMenuMeta";

export function ProjectBacklogPrimaryOptionsMenu({
  viewMode,
  onViewModeChange,
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
          <MenuSubTrigger>
            View
            {selectedViewLabel ? (
              <span className={menuValueClassName}>{selectedViewLabel}</span>
            ) : null}
          </MenuSubTrigger>
          <MenuSubPopup className="min-w-60">
            <MenuRadioGroup
              className="grid sm:grid-cols-2"
              value={viewMode}
              onValueChange={(value) => onViewModeChange(value as ProjectBacklogViewMode)}
            >
              {projectBacklogViewModes.map((option) => (
                <MenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>

        <MenuSub>
          <MenuSubTrigger>
            Issue types
            <span className={menuValueClassName}>{selectedIssueTypeLabel}</span>
          </MenuSubTrigger>
          <MenuSubPopup className="min-w-60">
            <MenuGroup>
              {projectBacklogIssueTypeFilterOptions.map((option) => (
                <MenuCheckboxItem
                  key={option.value}
                  checked={visibleIssueTypes.includes(option.value)}
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
