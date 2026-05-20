import type { GitHubPullRequestContextResponse } from "~/t3work/backend/t3work-githubTypes";
import type { ProjectShellProject } from "@t3tools/project-context";
import { buildGitHubActivityDisplay } from "~/t3work/t3work-githubActivityDisplay";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";
import {
  buildContextManifestPath,
  buildContextMetadataPath,
  buildGitHubActivityCacheRoot,
  buildGitHubActivityEntryPoint,
  buildJiraTicketEntryPoint,
} from "~/t3work/t3work-contextCachePaths";
import {
  compactJson,
  dedupeDirectoryBundleFiles,
  dedupeDirectoryBundleReferences,
  type T3WorkDirectoryBundlePayload,
} from "~/t3work/t3work-contextDirectoryBundle";
import { buildGitHubPullRequestArtifactBundle } from "~/t3work/t3work-githubPullRequestContextBundle";
import type { GitHubPullRequestRemoteAssetBundle } from "~/t3work/t3work-githubPullRequestContextAssets";
import { resolveTicketContextKey } from "~/t3work/t3work-ticketContextKey";

export function buildGitHubActivityContextBundle(input: {
  project: ProjectShellProject;
  item: GitHubWorkActivityItem;
  linkedWorkItem?: ProjectTicket | null;
  linkedTicketBundle?: T3WorkDirectoryBundlePayload;
  pullRequestContext?: GitHubPullRequestContextResponse;
  pullRequestRemoteAssets?: GitHubPullRequestRemoteAssetBundle;
}): T3WorkDirectoryBundlePayload {
  const display = buildGitHubActivityDisplay({ item: input.item });
  const root = buildGitHubActivityCacheRoot({
    projectId: input.project.id,
    repository: input.item.repository,
    activityId: input.item.id,
  });
  const files: Array<{ relativePath: string; contents: string }> = [];

  const write = (relativePath: string, value: unknown) => {
    files.push({ relativePath, contents: compactJson(value) });
  };

  const entryPoint = buildGitHubActivityEntryPoint({
    projectId: input.project.id,
    repository: input.item.repository,
    activityId: input.item.id,
  });
  const linkedTicketEntryPoint = input.linkedWorkItem
    ? buildJiraTicketEntryPoint(input.project.id, resolveTicketContextKey(input.linkedWorkItem))
    : null;
  const pullRequestArtifacts = input.pullRequestContext
    ? buildGitHubPullRequestArtifactBundle({
        root,
        context: input.pullRequestContext,
        ...(input.pullRequestRemoteAssets ? { remoteAssets: input.pullRequestRemoteAssets } : {}),
      })
    : null;

  write(buildContextManifestPath(root), {
    kind: "github-activity-context-manifest",
    syncedAt: new Date().toISOString(),
    activityKind: display.activityKind,
    activityLabel: display.targetType,
    activityId: input.item.id,
    entryPointRelativePath: entryPoint,
    linkedWorkItemEntryPointRelativePath: linkedTicketEntryPoint,
    ...(pullRequestArtifacts ? { pullRequestPackage: true } : {}),
  });

  write(`${root}/activity/item.json`, {
    activityKind: display.activityKind,
    item: input.item,
  });
  write(`${root}/repository/context.json`, {
    repository: input.item.repository,
    ...(input.item.repositoryUrl ? { repositoryUrl: input.item.repositoryUrl } : {}),
  });
  write(`${root}/project/context.json`, {
    id: input.project.id,
    title: input.project.title,
    source: input.project.source,
    ...(input.project.workspace?.rootPath
      ? { workspaceRoot: input.project.workspace.rootPath }
      : {}),
  });
  write(`${root}/linked-work-item/context.json`, {
    linkedWorkItem: input.linkedWorkItem ?? null,
    ...(linkedTicketEntryPoint
      ? { linkedTicketEntryPointRelativePath: linkedTicketEntryPoint }
      : {}),
  });
  write(buildContextMetadataPath(root), {
    item: input.item,
    linkedWorkItem: input.linkedWorkItem ?? null,
    ...(input.pullRequestContext
      ? {
          pullRequestContext: {
            pullRequestNumber: input.pullRequestContext.pullRequestNumber,
            capturedAt: input.pullRequestContext.capturedAt,
            ...(input.pullRequestContext.warnings
              ? { warnings: input.pullRequestContext.warnings }
              : {}),
          },
        }
      : {}),
  });
  write(entryPoint, {
    kind: display.activityKind,
    label: display.targetLabel,
    summaryItems: display.summaryItems,
    paths: {
      manifest: buildContextManifestPath(root),
      metadata: buildContextMetadataPath(root),
      activity: `${root}/activity/item.json`,
      repository: `${root}/repository/context.json`,
      project: `${root}/project/context.json`,
      linkedWorkItem: `${root}/linked-work-item/context.json`,
      ...(pullRequestArtifacts ? { pullRequest: pullRequestArtifacts.paths } : {}),
    },
  });

  const fileReferences = dedupeDirectoryBundleReferences([
    { label: "Activity entrypoint", relativePath: entryPoint },
    ...(pullRequestArtifacts?.fileReferences ?? []),
    ...(linkedTicketEntryPoint
      ? [{ label: "Linked ticket entrypoint", relativePath: linkedTicketEntryPoint }]
      : []),
  ]);

  return {
    kind: "t3work-directory-bundle",
    dedupeKey: `${input.project.id}:github-activity:${input.item.id}`,
    bundleRootRelativePath: root,
    files: dedupeDirectoryBundleFiles([
      ...files,
      ...(pullRequestArtifacts?.files ?? []),
      ...(input.linkedTicketBundle?.files ?? []),
    ]),
    fileReferences,
    lightweightItem: {
      kind: display.activityKind,
      label: display.targetLabel,
      summaryItems: display.summaryItems,
      references: fileReferences,
    },
  };
}
