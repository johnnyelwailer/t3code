import type { ProjectShellProject } from "@t3tools/project-context";

import { useAddToChat } from "~/t3work/hooks/t3work-useAddToChat";
import { GitHubActivitySection } from "~/t3work/t3work-GitHubActivitySection";
import {
  buildGitHubActivityContextBundle,
  buildGitHubActivityDisplay,
} from "~/t3work/t3work-githubActivityContextPayload";
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
  };
}) {
  const { showAddToChatContextMenu } = useAddToChat();

  return (
    <GitHubActivitySection
      title="Unmatched GitHub activity"
      items={githubActivity.unlinkedActivityItems}
      onItemContextMenu={(event, item) => {
        const display = buildGitHubActivityDisplay({ item });
        void showAddToChatContextMenu(event, {
          projectId: project.id,
          projectTitle: project.title,
          projectWorkspaceRoot: project.workspace?.rootPath,
          targetLabel: display.targetLabel,
          targetType: display.targetType,
          kind: display.activityKind,
          dedupeKey: `${project.id}:github-activity:${item.id}`,
          summaryItems: display.summaryItems,
          payload: buildGitHubActivityContextBundle({
            project,
            item,
            linkedWorkItem: null,
          }),
        });
      }}
      {...(githubActivity.warning ? { warning: githubActivity.warning } : {})}
      {...(githubActivity.suggestedRepositoryCount > 0
        ? { suggestedRepositoryCount: githubActivity.suggestedRepositoryCount }
        : {})}
      {...(githubActivity.host ? { host: githubActivity.host } : {})}
      {...(githubActivity.account ? { account: githubActivity.account } : {})}
    />
  );
}
