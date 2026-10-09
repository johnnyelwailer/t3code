import { EllipsisIcon } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { Menu, MenuPopup, MenuTrigger } from "~/t3team/components/ui/t3team-menu";
import { ProjectMyWorkOptionsMenuFilterSections } from "~/t3team/t3team-ProjectMyWorkOptionsMenuFilterSections";
import { ProjectMyWorkOptionsMenuViewSection } from "~/t3team/t3team-ProjectMyWorkOptionsMenuViewSection";
import type { ProjectMyWorkOptionsMenuProps } from "~/t3team/t3team-projectMyWorkOptionsMenuTypes";

export function ProjectMyWorkOptionsMenu({
  lens,
  activeOptionsCount,
  viewMode,
  onViewModeChange,
  groupMode,
  onGroupModeChange,
  statusCategory,
  onStatusCategoryChange,
  hiddenKanbanColumnIds,
  onKanbanLaneVisibilityChange,
  epicsHidden,
  onEpicsHiddenChange,
  excludedTypeKeys,
  onTypeVisibilityChange,
  typeOptions,
  kanbanLaneOptions,
  selectedPriority,
  onSelectedPriorityChange,
  priorityOptions,
  selectedStatus,
  onSelectedStatusChange,
  statusOptions,
  tableSortBy,
  onTableSortByChange,
  tableSortDirection,
  onTableSortDirectionChange,
  onReset,
}: ProjectMyWorkOptionsMenuProps) {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="icon" />} aria-label="My work options">
        <EllipsisIcon className="size-4" />
        {activeOptionsCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-foreground/80" />
        ) : null}
      </MenuTrigger>
      <MenuPopup align="end" side="bottom" className="min-w-68">
        <ProjectMyWorkOptionsMenuViewSection
          lens={lens}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          groupMode={groupMode}
          onGroupModeChange={onGroupModeChange}
          statusCategory={statusCategory}
          onStatusCategoryChange={onStatusCategoryChange}
          epicsHidden={epicsHidden}
          onEpicsHiddenChange={onEpicsHiddenChange}
          hiddenKanbanColumnIds={hiddenKanbanColumnIds}
          onKanbanLaneVisibilityChange={onKanbanLaneVisibilityChange}
          kanbanLaneOptions={kanbanLaneOptions}
          tableSortBy={tableSortBy}
          onTableSortByChange={onTableSortByChange}
          tableSortDirection={tableSortDirection}
          onTableSortDirectionChange={onTableSortDirectionChange}
        />
        <ProjectMyWorkOptionsMenuFilterSections
          excludedTypeKeys={excludedTypeKeys}
          onTypeVisibilityChange={onTypeVisibilityChange}
          typeOptions={typeOptions}
          selectedPriority={selectedPriority}
          onSelectedPriorityChange={onSelectedPriorityChange}
          priorityOptions={priorityOptions}
          selectedStatus={selectedStatus}
          onSelectedStatusChange={onSelectedStatusChange}
          statusOptions={statusOptions}
          onReset={onReset}
        />
      </MenuPopup>
    </Menu>
  );
}
