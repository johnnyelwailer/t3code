import type { MouseEvent as ReactMouseEvent } from "react";

import { ProjectDashboardTicketGitHubActivity } from "~/t3team/t3team-ProjectDashboardTicketGitHubActivity";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { getGitHubActivityItemsForWorkItem } from "~/t3team/t3team-githubActivity";
import { renderRelativeUpdatedAt } from "~/t3team/t3team-githubActivityViewUtils";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function ProjectMyWorkTicketExtra({
  ticket,
  showGitHubActivity,
  githubActivityByWorkItem,
  githubLastCheckedAt,
  compact = false,
  onGitHubActivityContextMenu,
  getGitHubActivityDragCapabilities,
}: {
  ticket: ProjectTicket;
  showGitHubActivity: boolean;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  githubLastCheckedAt?: number;
  compact?: boolean;
  onGitHubActivityContextMenu: (
    event: ReactMouseEvent<Element>,
    ticket: ProjectTicket | null,
    item: GitHubWorkActivityItem,
    options?: { fallbackHost?: string },
  ) => void;
  getGitHubActivityDragCapabilities?: (
    ticket: ProjectTicket,
    item: GitHubWorkActivityItem,
  ) => AgentContextCapabilities;
}) {
  const updatedLabel = renderRelativeUpdatedAt(ticket.updatedAt);
  const githubItems = getGitHubActivityItemsForWorkItem(
    githubActivityByWorkItem,
    ticket.ref.displayId,
  );

  if (!updatedLabel && githubItems.length === 0) {
    return null;
  }

  return (
    <>
      {!compact && updatedLabel ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[10px] text-muted-foreground">Updated {updatedLabel}</span>
        </div>
      ) : null}
      {showGitHubActivity && githubItems.length > 0 ? (
        <div className={compact ? "mt-0.5" : `${updatedLabel ? "mt-1" : "mt-2"}`}>
          <ProjectDashboardTicketGitHubActivity
            items={githubItems}
            enabled={showGitHubActivity}
            limit={compact ? 1 : 2}
            {...(compact ? { compact } : {})}
            {...(githubLastCheckedAt !== undefined ? { lastCheckedAt: githubLastCheckedAt } : {})}
            onItemContextMenu={(event, item) => onGitHubActivityContextMenu(event, ticket, item)}
            {...(getGitHubActivityDragCapabilities
              ? {
                  getItemDragCapabilities: (item: GitHubWorkActivityItem) =>
                    getGitHubActivityDragCapabilities(ticket, item),
                }
              : {})}
          />
        </div>
      ) : null}
    </>
  );
}
