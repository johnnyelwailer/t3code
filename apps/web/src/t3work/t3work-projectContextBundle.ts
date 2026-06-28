import type { ProjectShellProject } from "@t3tools/project-context";
import { T3WORK_CONTEXT_AVAILABILITY_SUMMARY } from "@t3tools/project-context/t3workContextAvailability";

import {
  buildContextManifestPath,
  buildContextMetadataPath,
  buildJiraTicketCacheRoot,
  buildJiraTicketEntryPoint,
  buildProjectContextCacheRoot,
  buildProjectContextEntryPoint,
  sanitizePathSegment,
} from "~/t3work/t3work-contextCachePaths";
import {
  compactJson,
  type T3WorkDirectoryBundlePayload,
} from "~/t3work/t3work-contextDirectoryBundle";
import { buildJiraWorkItemSummary } from "~/t3work/t3work-jiraContextMetadata";
import { resolveTicketContextKey } from "~/t3work/t3work-ticketContextKey";
import type { ProjectThread, ProjectTicket } from "~/t3work/t3work-types";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";

export type ProjectVisibleWorkspaceContext = {
  readonly projectThreads?: ReadonlyArray<ProjectThread>;
  readonly githubActivityItems?: ReadonlyArray<GitHubWorkActivityItem>;
  readonly uiState?: unknown;
  readonly jiraLastCheckedAt?: number;
  readonly githubLastCheckedAt?: number;
};

export function buildProjectContextBundle(input: {
  project: ProjectShellProject;
  linkedRepositoryUrls: ReadonlyArray<string>;
  projectTickets?: ReadonlyArray<ProjectTicket>;
  visibleContext?: ProjectVisibleWorkspaceContext;
}): T3WorkDirectoryBundlePayload {
  const root = buildProjectContextCacheRoot(input.project.id);
  const entryPoint = buildProjectContextEntryPoint(input.project.id);
  const files: Array<{ relativePath: string; contents: string }> = [];

  const write = (relativePath: string, value: unknown) => {
    files.push({ relativePath, contents: compactJson(value) });
  };

  write(buildContextMetadataPath(root), {
    project: input.project,
    linkedRepositoryUrls: input.linkedRepositoryUrls,
  });
  write(`${root}/linked-repositories.json`, { linkedRepositoryUrls: input.linkedRepositoryUrls });

  const workItems = input.projectTickets?.map((ticket) => {
    const ticketKey = resolveTicketContextKey(ticket);
    const relativePath = `${root}/work-items/${sanitizePathSegment(ticketKey)}.json`;
    const fullBundleRootRelativePath = buildJiraTicketCacheRoot(input.project.id, ticketKey);
    const ticketEntryPointRelativePath = buildJiraTicketEntryPoint(input.project.id, ticketKey);
    write(relativePath, {
      ticket,
      summaryItems: buildJiraWorkItemSummary(ticket).summaryItems,
      ticketEntryPointRelativePath,
      availability: T3WORK_CONTEXT_AVAILABILITY_SUMMARY,
      loadableOnDemand: true,
      fullBundleRootRelativePath,
    });
    return {
      key: ticketKey,
      relativePath,
      ticketEntryPointRelativePath,
      fullBundleRootRelativePath,
      availability: T3WORK_CONTEXT_AVAILABILITY_SUMMARY,
      loadableOnDemand: true,
      updatedAt: ticket.updatedAt,
    };
  });

  if (workItems) {
    write(`${root}/work-items/index.json`, { workItems });
  }
  if (input.visibleContext?.projectThreads) {
    write(`${root}/threads/index.json`, { threads: input.visibleContext.projectThreads });
  }
  if (input.visibleContext?.githubActivityItems) {
    write(`${root}/github/activity/index.json`, {
      activityItems: input.visibleContext.githubActivityItems,
      lastCheckedAt: input.visibleContext.githubLastCheckedAt,
    });
  }
  if (input.visibleContext?.uiState) {
    write(`${root}/ui/visible-state.json`, {
      state: input.visibleContext.uiState,
      jiraLastCheckedAt: input.visibleContext.jiraLastCheckedAt,
      githubLastCheckedAt: input.visibleContext.githubLastCheckedAt,
    });
  }

  write(buildContextManifestPath(root), {
    kind: "project-context-manifest",
    syncedAt: new Date().toISOString(),
    projectId: input.project.id,
    entryPointRelativePath: entryPoint,
    contextAvailabilityGuide: {
      summary: "Lightweight work-item JSON under work-items/*.json; full bundles load on demand.",
      full: "Rich per-item trees under jira/<project>/items/<key>/ after refresh.",
      onDemandTool: "t3work.work_item.refresh_context_bundle",
    },
    ...(workItems ? { workItemCount: workItems.length } : {}),
  });
  const entryPointPaths = {
    manifest: buildContextManifestPath(root),
    metadata: buildContextMetadataPath(root),
    linkedRepositories: `${root}/linked-repositories.json`,
    ...(workItems ? { workItemsIndex: `${root}/work-items/index.json` } : {}),
    ...(input.visibleContext?.projectThreads ? { threadsIndex: `${root}/threads/index.json` } : {}),
    ...(input.visibleContext?.githubActivityItems
      ? { githubActivityIndex: `${root}/github/activity/index.json` }
      : {}),
    ...(input.visibleContext?.uiState ? { visibleUiState: `${root}/ui/visible-state.json` } : {}),
  };
  const summaryItems = [
    ...(workItems ? [{ label: "Work items", value: String(workItems.length) }] : []),
    { label: "Linked repositories", value: String(input.linkedRepositoryUrls.length) },
    ...(input.visibleContext?.projectThreads
      ? [{ label: "Visible threads", value: String(input.visibleContext.projectThreads.length) }]
      : []),
    ...(input.visibleContext?.githubActivityItems
      ? [
          {
            label: "GitHub activity",
            value: String(input.visibleContext.githubActivityItems.length),
          },
        ]
      : []),
  ];
  write(entryPoint, {
    kind: "project",
    label: input.project.title,
    summaryItems,
    contextAvailabilityGuide: {
      summary: "work-items/*.json",
      full: "jira/<project>/items/<key>/",
      onDemandTool: "t3work.work_item.refresh_context_bundle",
    },
    paths: entryPointPaths,
  });

  return {
    kind: "t3work-directory-bundle",
    dedupeKey: `${input.project.id}:project-context`,
    bundleRootRelativePath: root,
    files,
    fileReferences: [{ label: "Project entrypoint", relativePath: entryPoint }],
    lightweightItem: {
      kind: "project",
      label: input.project.title,
      summaryItems,
      references: [{ label: "Project entrypoint", relativePath: entryPoint }],
    },
  };
}
