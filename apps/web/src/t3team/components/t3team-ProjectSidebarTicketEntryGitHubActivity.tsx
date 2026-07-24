import type { MouseEvent } from "react";

import { GitHubActivityInlineList } from "~/t3team/t3team-GitHubActivityViews";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";

export function ProjectSidebarTicketEntryGitHubActivity({
  items,
  lastCheckedAt,
  showGitHubActivity,
  onItemContextMenu,
  getItemDragCapabilities,
}: {
  items: ReadonlyArray<GitHubWorkActivityItem>;
  lastCheckedAt?: number;
  showGitHubActivity: boolean;
  onItemContextMenu: (event: MouseEvent, item: GitHubWorkActivityItem) => void;
  getItemDragCapabilities: (item: GitHubWorkActivityItem) => AgentContextCapabilities;
}) {
  if (!showGitHubActivity || items.length === 0) {
    return null;
  }

  return (
    <div className="mt-0.5">
      <GitHubActivityInlineList
        items={items}
        limit={2}
        compact
        {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
        onItemContextMenu={onItemContextMenu}
        getItemDragCapabilities={getItemDragCapabilities}
      />
    </div>
  );
}
