/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import type { ProjectSortOrder, ThreadSortOrder } from "~/t3team/t3team-types";
import { Button } from "~/t3team/components/ui/t3team-button";
import {
  Menu,
  MenuPopup,
  MenuTrigger,
  MenuRadioGroup,
  MenuRadioItem,
  MenuGroup,
  MenuSeparator,
  MenuCheckboxItem,
} from "~/t3team/components/ui/t3team-menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "~/t3team/components/ui/t3team-tooltip";
import { EllipsisIcon } from "lucide-react";
import {
  PROJECT_SORT_LABELS,
  THREAD_SORT_LABELS,
  TICKET_VIEW_LABELS,
  type TicketViewMode,
} from "./t3team-projectSidebarShared";
import {
  buildSidebarContentMenuModel,
  type SidebarContentToggleId,
} from "./t3team-projectSortMenuSidebarContent";
import { SidebarToggleItem } from "./t3team-projectSortMenuSidebarToggleItem";

export function ProjectSortMenu({
  projectSortOrder,
  threadSortOrder,
  threadPreviewCount,
  ticketViewMode,
  showProjectThreads,
  showMyActivityFeed,
  showJiraItems,
  showGitHubActivity,
  onProjectSortOrderChange,
  onTicketViewModeChange,
  onThreadSortOrderChange,
  onThreadPreviewCountChange,
  onShowProjectThreadsChange,
  onShowMyActivityFeedChange,
  onShowJiraItemsChange,
  onShowGitHubActivityChange,
}: {
  projectSortOrder: ProjectSortOrder;
  threadSortOrder: ThreadSortOrder;
  threadPreviewCount: number;
  ticketViewMode: TicketViewMode;
  showProjectThreads: boolean;
  showMyActivityFeed: boolean;
  showJiraItems: boolean;
  showGitHubActivity: boolean;
  onProjectSortOrderChange: (sortOrder: ProjectSortOrder) => void;
  onTicketViewModeChange: (viewMode: TicketViewMode) => void;
  onThreadSortOrderChange: (sortOrder: ThreadSortOrder) => void;
  onThreadPreviewCountChange: (count: number) => void;
  onShowProjectThreadsChange: (show: boolean) => void;
  onShowMyActivityFeedChange: (show: boolean) => void;
  onShowJiraItemsChange: (show: boolean) => void;
  onShowGitHubActivityChange: (show: boolean) => void;
}) {
  const sidebarContentMenu = buildSidebarContentMenuModel({
    showProjectThreads,
    showMyActivityFeed,
    showJiraItems,
    showGitHubActivity,
  });

  const sidebarContentToggleHandlers: Record<SidebarContentToggleId, (show: boolean) => void> = {
    projectThreads: onShowProjectThreadsChange,
    myActivityFeed: onShowMyActivityFeedChange,
    jiraItems: onShowJiraItemsChange,
    gitHubActivity: onShowGitHubActivityChange,
  };

  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              aria-label="Sidebar options"
              render={<Button size="icon-micro" variant="ghost-muted" />}
            />
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
                <MenuRadioItem key={value} value={value} className="min-h-7">
                  <span className="text-xs">{label}</span>
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
                <MenuRadioItem key={value} value={value} className="min-h-7">
                  <span className="text-xs">{label}</span>
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
                <MenuRadioItem key={value} value={value} className="min-h-7">
                  <span className="text-xs">{label}</span>
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
            {sidebarContentMenu.title}
          </div>
          <div className="px-2 pb-2 text-3xs leading-4 text-muted-foreground/80">
            {sidebarContentMenu.description}
          </div>
          {sidebarContentMenu.primaryItems.map((item) => (
            <SidebarToggleItem
              key={item.id}
              label={item.label}
              description={item.description}
              checked={item.checked}
              disabled={item.disabled}
              onCheckedChange={sidebarContentToggleHandlers[item.id]}
            />
          ))}
          <div className="px-2 pt-3 pb-1 text-3xs font-medium uppercase tracking-widest text-muted-foreground/60">
            {sidebarContentMenu.feedTitle}
          </div>
          {sidebarContentMenu.feedItems.map((item) => (
            <SidebarToggleItem
              key={item.id}
              label={item.label}
              description={item.description}
              checked={item.checked}
              disabled={item.disabled}
              onCheckedChange={sidebarContentToggleHandlers[item.id]}
            />
          ))}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
