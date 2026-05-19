import type { ProjectSortOrder, ThreadSortOrder } from "~/t3work/t3work-types";
import { Button } from "~/t3work/components/ui/t3work-button";
import {
  Menu,
  MenuPopup,
  MenuTrigger,
  MenuRadioGroup,
  MenuRadioItem,
  MenuGroup,
  MenuSeparator,
  MenuCheckboxItem,
} from "~/t3work/components/ui/t3work-menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "~/t3work/components/ui/t3work-tooltip";
import { EllipsisIcon } from "lucide-react";
import {
  PROJECT_SORT_LABELS,
  THREAD_SORT_LABELS,
  TICKET_VIEW_LABELS,
  type TicketViewMode,
} from "./t3work-projectSidebarShared";

export function ProjectSortMenu({
  projectSortOrder,
  threadSortOrder,
  threadPreviewCount,
  ticketViewMode,
  showProjectThreads,
  showJiraItems,
  showGitHubActivity,
  onProjectSortOrderChange,
  onTicketViewModeChange,
  onThreadSortOrderChange,
  onThreadPreviewCountChange,
  onShowProjectThreadsChange,
  onShowJiraItemsChange,
  onShowGitHubActivityChange,
}: {
  projectSortOrder: ProjectSortOrder;
  threadSortOrder: ThreadSortOrder;
  threadPreviewCount: number;
  ticketViewMode: TicketViewMode;
  showProjectThreads: boolean;
  showJiraItems: boolean;
  showGitHubActivity: boolean;
  onProjectSortOrderChange: (sortOrder: ProjectSortOrder) => void;
  onTicketViewModeChange: (viewMode: TicketViewMode) => void;
  onThreadSortOrderChange: (sortOrder: ThreadSortOrder) => void;
  onThreadPreviewCountChange: (count: number) => void;
  onShowProjectThreadsChange: (show: boolean) => void;
  onShowJiraItemsChange: (show: boolean) => void;
  onShowGitHubActivityChange: (show: boolean) => void;
}) {
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground" />
          }
        >
          <EllipsisIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="right">Sidebar options</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end" side="bottom" className="min-w-52">
        <MenuGroup>
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Sort projects</div>
          <MenuRadioGroup
            value={projectSortOrder}
            onValueChange={(value) => onProjectSortOrderChange(value as ProjectSortOrder)}
          >
            {(Object.entries(PROJECT_SORT_LABELS) as Array<[ProjectSortOrder, string]>).map(
              ([value, label]) => (
                <MenuRadioItem key={value} value={value} className="min-h-7 py-1 text-xs">
                  {label}
                </MenuRadioItem>
              ),
            )}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuGroup>
          <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">Issue view</div>
          <MenuRadioGroup
            value={ticketViewMode}
            onValueChange={(value) => onTicketViewModeChange(value as TicketViewMode)}
          >
            {(Object.entries(TICKET_VIEW_LABELS) as Array<[TicketViewMode, string]>).map(
              ([value, label]) => (
                <MenuRadioItem key={value} value={value} className="min-h-7 py-1 text-xs">
                  {label}
                </MenuRadioItem>
              ),
            )}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuGroup>
          <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
            Sort threads
          </div>
          <MenuRadioGroup
            value={threadSortOrder}
            onValueChange={(value) => onThreadSortOrderChange(value as ThreadSortOrder)}
          >
            {(Object.entries(THREAD_SORT_LABELS) as Array<[ThreadSortOrder, string]>).map(
              ([value, label]) => (
                <MenuRadioItem key={value} value={value} className="min-h-7 py-1 text-xs">
                  {label}
                </MenuRadioItem>
              ),
            )}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
            Visible threads
          </div>
          <div className="px-2 py-1 flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() => onThreadPreviewCountChange(Math.max(1, threadPreviewCount - 1))}
            >
              -
            </Button>
            <span className="text-xs tabular-nums">{threadPreviewCount}</span>
            <Button
              size="xs"
              variant="outline"
              onClick={() => onThreadPreviewCountChange(Math.min(20, threadPreviewCount + 1))}
            >
              +
            </Button>
          </div>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
            Visible items
          </div>
          <MenuCheckboxItem
            checked={showProjectThreads}
            onCheckedChange={(checked) => onShowProjectThreadsChange(Boolean(checked))}
            className="min-h-7 py-1 text-xs"
          >
            Project threads
          </MenuCheckboxItem>
          <MenuCheckboxItem
            checked={showJiraItems}
            onCheckedChange={(checked) => onShowJiraItemsChange(Boolean(checked))}
            className="min-h-7 py-1 text-xs"
          >
            Jira items
          </MenuCheckboxItem>
          <MenuCheckboxItem
            checked={showGitHubActivity}
            onCheckedChange={(checked) => onShowGitHubActivityChange(Boolean(checked))}
            className="min-h-7 py-1 text-xs"
          >
            GitHub activity
          </MenuCheckboxItem>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
