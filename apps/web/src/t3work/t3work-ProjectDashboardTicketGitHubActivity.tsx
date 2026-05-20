import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { GitHubActivityInlineList } from "~/t3work/t3work-GitHubActivityViews";

export function ProjectDashboardTicketGitHubActivity({
  items,
  enabled,
  limit,
  compact,
  lastCheckedAt,
  onItemContextMenu,
}: {
  items: ReadonlyArray<GitHubWorkActivityItem>;
  enabled: boolean;
  limit: number;
  compact?: boolean;
  lastCheckedAt?: number;
  onItemContextMenu: (event: React.MouseEvent, item: GitHubWorkActivityItem) => void;
}) {
  if (!enabled) return null;

  return (
    <GitHubActivityInlineList
      items={items}
      limit={limit}
      {...(compact ? { compact } : {})}
      {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
      onItemContextMenu={onItemContextMenu}
    />
  );
}
