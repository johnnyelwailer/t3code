import type { ProjectShellProject } from "@t3tools/project-context";

import { useTicketAgentContext } from "~/t3team/hooks/t3team-useTicketAgentContext";
import { GitHubActivitySection } from "~/t3team/t3team-GitHubActivitySection";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";

export function ProjectDashboardUnmatchedActivity({
  project,
  githubActivity,
}: {
  project: ProjectShellProject;
  githubActivity: {
    unlinkedActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
    warning: string | undefined;
    suggestedRepositoryCount: number;
    host: string;
    account: string | undefined;
    lastCheckedAt: number | undefined;
  };
}) {
  const { getGitHubActivityAgentContext, openGitHubActivityAgentContextMenu } =
    useTicketAgentContext({
      project,
      projectTickets: [],
    });

  return (
    <GitHubActivitySection
      title="Unmatched GitHub activity"
      items={githubActivity.unlinkedActivityItems}
      onItemContextMenu={(event, item) => {
        openGitHubActivityAgentContextMenu(event, null, item, {
          fallbackHost: githubActivity.host,
        });
      }}
      getItemDragCapabilities={(item) =>
        getGitHubActivityAgentContext(null, item, { fallbackHost: githubActivity.host })
      }
      {...(githubActivity.warning ? { warning: githubActivity.warning } : {})}
      {...(githubActivity.suggestedRepositoryCount > 0
        ? { suggestedRepositoryCount: githubActivity.suggestedRepositoryCount }
        : {})}
      {...(githubActivity.lastCheckedAt !== undefined
        ? { lastCheckedAt: githubActivity.lastCheckedAt }
        : {})}
      {...(githubActivity.host ? { host: githubActivity.host } : {})}
      {...(githubActivity.account ? { account: githubActivity.account } : {})}
    />
  );
}
