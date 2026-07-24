import { EllipsisIcon } from "lucide-react";

import { Menu, MenuPopup, MenuTrigger } from "~/t3team/components/ui/t3team-menu";
import { ProjectMyWorkOptionsMenuFilterSections } from "~/t3team/t3team-ProjectMyWorkOptionsMenuFilterSections";
import { ProjectMyWorkOptionsMenuViewSection } from "~/t3team/t3team-ProjectMyWorkOptionsMenuViewSection";
import type { ProjectMyWorkOptionsMenuProps } from "~/t3team/t3team-projectMyWorkOptionsMenuTypes";

export function ProjectMyWorkOptionsMenu({
  activeOptionsCount,
  viewMode,
  onViewModeChange,
  groupMode,
  onGroupModeChange,
  statusCategory,
  onStatusCategoryChange,
  showGitHubActivity,
  onShowGitHubActivityChange,
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
      <MenuTrigger
        className="relative inline-flex size-8 items-center justify-center rounded-md border border-border/70 bg-background/90 text-muted-foreground transition-[border-color,background-color,color] hover:border-border hover:bg-accent/70 hover:text-foreground"
        aria-label="My work options"
      >
        <EllipsisIcon className="size-4" />
        {activeOptionsCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-foreground/80" />
        ) : null}
      </MenuTrigger>
      <MenuPopup
        align="end"
        side="bottom"
        className="min-w-[17rem] border-border/80 bg-background/95"
      >
        <ProjectMyWorkOptionsMenuViewSection
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          groupMode={groupMode}
          onGroupModeChange={onGroupModeChange}
          statusCategory={statusCategory}
          onStatusCategoryChange={onStatusCategoryChange}
          showGitHubActivity={showGitHubActivity}
          onShowGitHubActivityChange={onShowGitHubActivityChange}
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
