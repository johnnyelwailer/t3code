import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { GitHubActivityInlineList } from "~/t3team/t3team-GitHubActivityViews";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";

export function ProjectDashboardTicketGitHubActivity({
  items,
  enabled,
  limit,
  compact,
  lastCheckedAt,
  onItemContextMenu,
  getItemDragCapabilities,
}: {
  items: ReadonlyArray<GitHubWorkActivityItem>;
  enabled: boolean;
  limit: number;
  compact?: boolean;
  lastCheckedAt?: number;
  onItemContextMenu: (event: React.MouseEvent, item: GitHubWorkActivityItem) => void;
  getItemDragCapabilities?: (item: GitHubWorkActivityItem) => AgentContextCapabilities;
}) {
  if (!enabled) return null;

  return (
    <GitHubActivityInlineList
      items={items}
      limit={limit}
      {...(compact ? { compact } : {})}
      {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
      onItemContextMenu={onItemContextMenu}
      {...(getItemDragCapabilities ? { getItemDragCapabilities } : {})}
    />
  );
}
