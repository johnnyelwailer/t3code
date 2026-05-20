import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { AddToChatPayloadInput, AddToChatRequest } from "~/t3work/t3work-addToChatUtils";
import { buildGitHubActivityCacheRoot } from "~/t3work/t3work-contextCachePaths";
import { buildGitHubActivityDisplay } from "~/t3work/t3work-githubActivityDisplay";
import { buildGitHubActivityContextBundle } from "~/t3work/t3work-githubActivityContextPayload";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { buildGitHubPullRequestRemoteAssetBundle } from "~/t3work/t3work-githubPullRequestContextAssets";
import { buildTicketContextBundle } from "~/t3work/t3work-ticketContextBundle";
import type { ProjectTicket } from "~/t3work/t3work-types";

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
        input.backend && input.linkedWorkItem && input.projectTickets
          ? await buildTicketContextBundle({
              backend: input.backend,
              project: input.project,
              ticket: input.linkedWorkItem,
              projectTickets: input.projectTickets,
              githubActivityItems: input.githubActivityItems ?? [],
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
