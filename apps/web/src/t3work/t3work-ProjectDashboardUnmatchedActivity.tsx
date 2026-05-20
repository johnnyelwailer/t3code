import type { ProjectShellProject } from "@t3tools/project-context";

import { useBackend } from "~/t3work/backend/t3work-index";
import { useAddToChat } from "~/t3work/hooks/t3work-useAddToChat";
import { GitHubActivitySection } from "~/t3work/t3work-GitHubActivitySection";
import { createGitHubActivityAddToChatRequest } from "~/t3work/t3work-githubActivityAttachmentRequest";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";

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
  const backend = useBackend();
  const { showAddToChatContextMenu } = useAddToChat();

  return (
    <GitHubActivitySection
      title="Unmatched GitHub activity"
      items={githubActivity.unlinkedActivityItems}
      onItemContextMenu={(event, item) => {
        void showAddToChatContextMenu(
          event,
          createGitHubActivityAddToChatRequest({
            backend,
            project,
            item,
            linkedWorkItem: null,
            fallbackHost: githubActivity.host,
          }),
        );
      }}
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
