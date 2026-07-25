import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { AddToChatPayloadInput, AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import { buildGitHubActivityCacheRoot } from "~/t3team/t3team-contextCachePaths";
import { buildGitHubActivityDisplay } from "~/t3team/t3team-githubActivityDisplay";
import { buildGitHubActivityContextBundle } from "~/t3team/t3team-githubActivityContextPayload";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { buildGitHubPullRequestRemoteAssetBundle } from "~/t3team/t3team-githubPullRequestContextAssets";
import { refreshWorkItemContextBundle } from "~/t3team/t3team-refreshWorkItemContextBundle";
import { buildJiraWorkItemSummary } from "~/t3team/t3team-jiraContextMetadata";
import type { ProjectTicket } from "~/t3team/t3team-types";

function isPullRequestActivity(item: GitHubWorkActivityItem): boolean {
  return (item.subjectType ?? "").trim().toLowerCase() === "pullrequest";
}

function hostFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

export function createGitHubActivityAddToChatRequest(input: {
  backend?: BackendApi | null | undefined;
  project: ProjectShellProject;
  item: GitHubWorkActivityItem;
  linkedWorkItem?: ProjectTicket | null;
  projectTickets?: ReadonlyArray<ProjectTicket>;
  githubActivityItems?: ReadonlyArray<GitHubWorkActivityItem>;
  fallbackHost?: string;
}): AddToChatRequest {
  const display = buildGitHubActivityDisplay({ item: input.item });
  return {
    projectId: input.project.id,
    projectTitle: input.project.title,
    ...(input.project.workspace?.rootPath
      ? { projectWorkspaceRoot: input.project.workspace.rootPath }
      : {}),
    targetLabel: display.targetLabel,
    targetType: display.targetType,
    kind: display.activityKind,
    dedupeKey: `${input.project.id}:github-activity:${input.item.id}`,
    summaryItems: display.summaryItems,
    payload: async (payloadInput?: AddToChatPayloadInput) => {
      let pullRequestContext;
      let pullRequestRemoteAssets;
      if (input.backend && isPullRequestActivity(input.item)) {
        const host =
          hostFromUrl(input.item.subjectUrl) ??
          hostFromUrl(input.item.repositoryUrl) ??
          input.fallbackHost;
        if (host) {
          payloadInput?.reportProgress?.({
            phase: "Fetching GitHub pull request package",
            syncInfo: {
              contentLabel: "GitHub pull request package",
              currentItemLabel: input.item.subjectTitle ?? input.item.repository,
            },
          });
          try {
            pullRequestContext = await input.backend.github.getPullRequestContext({
              host,
              repository: input.item.repository,
              ...(input.item.subjectUrl ? { subjectUrl: input.item.subjectUrl } : {}),
              itemId: input.item.id,
            });
            pullRequestRemoteAssets = await buildGitHubPullRequestRemoteAssetBundle({
              backend: input.backend,
              root: buildGitHubActivityCacheRoot({
                projectId: input.project.id,
                repository: input.item.repository,
                activityId: input.item.id,
              }),
              context: pullRequestContext,
              ...(payloadInput?.reportProgress ? { onProgress: payloadInput.reportProgress } : {}),
            });
          } catch {
            // Fall back to the summary bundle when the richer GitHub package is unavailable.
          }
        }
      }

      const linkedTicketBundle =
        input.backend && input.linkedWorkItem
          ? await refreshWorkItemContextBundle({
              backend: input.backend,
              project: input.project,
              ticket: input.linkedWorkItem,
              summaryItems: buildJiraWorkItemSummary(input.linkedWorkItem).summaryItems,
              ...(payloadInput?.reportProgress ? { onProgress: payloadInput.reportProgress } : {}),
            })
          : undefined;

      return buildGitHubActivityContextBundle({
        project: input.project,
        item: input.item,
        linkedWorkItem: input.linkedWorkItem ?? null,
        ...(linkedTicketBundle ? { linkedTicketBundle } : {}),
        ...(pullRequestContext ? { pullRequestContext } : {}),
        ...(pullRequestRemoteAssets ? { pullRequestRemoteAssets } : {}),
      });
    },
  };
}
