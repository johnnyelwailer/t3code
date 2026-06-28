import type { ProjectShellProject } from "@t3tools/project-context";
import { T3WORK_CONTEXT_AVAILABILITY_FULL } from "@t3tools/project-context/t3workContextAvailability";

import type { AddToChatPayloadProgressUpdate } from "~/t3work/t3work-addToChatUtils";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { buildJiraWorkItemSummary } from "~/t3work/t3work-jiraContextMetadata";
import {
  buildContextManifestPath,
  buildContextMetadataPath,
  buildJiraTicketCacheRoot,
  buildJiraTicketEntryPoint,
  buildJiraTicketFocusEntryPoint,
} from "~/t3work/t3work-contextCachePaths";
import {
  compactJson,
  type T3WorkDirectoryBundleFile,
  type T3WorkDirectoryBundlePayload,
} from "~/t3work/t3work-contextDirectoryBundle";
import { buildTicketContextAttachmentAssets } from "~/t3work/t3work-ticketContextAttachmentAssets";
import { buildTicketContextGraph } from "~/t3work/t3work-ticketContextGraph";
import {
  buildTicketContextBundlePreparedUpdate,
  buildFocusedTicketContextBundle,
  buildWorkItemTicketContextBundle,
  type TicketContextFocusInput,
} from "~/t3work/t3work-ticketContextBundleOutputs";
import { resolveTicketContextKey } from "~/t3work/t3work-ticketContextKey";
import type { ProjectTicket } from "~/t3work/t3work-types";

export async function buildTicketContextBundle(input: {
  backend: BackendApi;
  project: ProjectShellProject;
  ticket: ProjectTicket;
  projectTickets: ReadonlyArray<ProjectTicket>;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  focus?: TicketContextFocusInput;
  onProgress?: ((update: AddToChatPayloadProgressUpdate) => void) | undefined;
}): Promise<T3WorkDirectoryBundlePayload> {
  const graph = await buildTicketContextGraph(input);
  const selectionSummary = graph.selectionSummary ?? {
    strategy: "focused" as const,
    parentChainIncluded: 0,
    directChildrenIncluded: 0,
    directChildrenSkipped: 0,
    directReferencesIncluded: 0,
    directReferencesSkipped: 0,
  };
  const rootKey = graph.rootKey;
  const root = buildJiraTicketCacheRoot(input.project.id, rootKey);
  const rootEntryPoint = buildJiraTicketEntryPoint(input.project.id, rootKey);
  const syncedAt = new Date().toISOString();
  const files: T3WorkDirectoryBundleFile[] = [];
  const skippedRelationCount =
    selectionSummary.directChildrenSkipped + selectionSummary.directReferencesSkipped;
  const rootContextScope = {
    ...selectionSummary,
    githubActivityIncluded: input.githubActivityItems.length,
  };
  const attachmentAssets = await buildTicketContextAttachmentAssets({
    backend: input.backend,
    project: input.project,
    graph,
    ...(input.onProgress ? { onProgress: input.onProgress } : {}),
  });
  const rootAttachmentIndex = attachmentAssets.byTicketKey.get(rootKey);

  input.onProgress?.(buildTicketContextBundlePreparedUpdate({ graph, skippedRelationCount }));

  const write = (relativePath: string, value: unknown) => {
    files.push({ relativePath, contents: compactJson(value) });
  };

  for (const node of graph.nodes.values()) {
    const nodeRoot = buildJiraTicketCacheRoot(input.project.id, node.key);
    const entryPoint = buildJiraTicketEntryPoint(input.project.id, node.key);
    const attachmentIndex = attachmentAssets.byTicketKey.get(node.key);
    const directLinks = [
      ...(node.relationshipKeys.parentKey
        ? [{ relation: "parent", key: node.relationshipKeys.parentKey }]
        : []),
      ...node.relationshipKeys.childKeys.map((key) => ({ relation: "child", key })),
      ...node.relationshipKeys.referenceKeys.map((key) => ({ relation: "reference", key })),
    ].map((link) => {
      return {
        relation: link.relation,
        key: link.key,
        entryPointRelativePath: buildJiraTicketEntryPoint(input.project.id, link.key),
      };
    });
    const summaryItems = node.ticket ? buildJiraWorkItemSummary(node.ticket).summaryItems : [];

    write(buildContextMetadataPath(nodeRoot), {
      key: node.key,
      ticket: node.ticket,
      ...(node.snapshot ? { snapshotRef: node.snapshot.ref } : {}),
      ...(node.error ? { error: node.error } : {}),
    });
    write(`${nodeRoot}/relationships.json`, node.relationshipKeys);
    if (node.snapshot) {
      write(`${nodeRoot}/snapshot.json`, node.snapshot);
    }
    write(buildContextManifestPath(nodeRoot), {
      kind: "jira-work-item-context-manifest",
      syncedAt,
      availability: T3WORK_CONTEXT_AVAILABILITY_FULL,
      bundleDepth: "full",
      key: node.key,
      title: node.ticket?.ref.title ?? node.snapshot?.ref.title ?? node.key,
      sourceUpdatedAt: node.ticket?.updatedAt ?? node.snapshot?.ref.updatedAt ?? null,
      entryPointRelativePath: entryPoint,
      directLinks,
      ...(attachmentIndex
        ? {
            attachmentCount: attachmentIndex.attachmentCount,
            attachmentDownloadFailures: attachmentIndex.failedCount,
          }
        : {}),
      ...(node.key === rootKey ? { contextScope: rootContextScope } : {}),
    });
    write(entryPoint, {
      kind: "jira-work-item",
      availability: T3WORK_CONTEXT_AVAILABILITY_FULL,
      bundleDepth: "full",
      key: node.key,
      label: node.ticket
        ? `${resolveTicketContextKey(node.ticket)} ${node.ticket.ref.title}`
        : (node.snapshot?.ref.title ?? node.key),
      summaryItems,
      paths: {
        manifest: buildContextManifestPath(nodeRoot),
        metadata: buildContextMetadataPath(nodeRoot),
        relationships: `${nodeRoot}/relationships.json`,
        ...(node.snapshot ? { snapshot: `${nodeRoot}/snapshot.json` } : {}),
        ...(attachmentIndex ? { attachments: attachmentIndex.indexRelativePath } : {}),
        ...(node.key === rootKey && input.githubActivityItems.length > 0
          ? { githubActivity: `${nodeRoot}/github-activity/index.json` }
          : {}),
      },
      directLinks,
      ...(attachmentIndex
        ? {
            attachmentSummary: {
              count: attachmentIndex.attachmentCount,
              failedCount: attachmentIndex.failedCount,
            },
          }
        : {}),
      ...(node.key === rootKey ? { contextScope: rootContextScope } : {}),
    });
  }

  files.push(...attachmentAssets.files);

  if (input.githubActivityItems.length > 0) {
    write(`${root}/github-activity/index.json`, { githubActivityItems: input.githubActivityItems });
  }

  if (input.focus) {
    const focusPath = buildJiraTicketFocusEntryPoint({
      projectId: input.project.id,
      ticketKey: rootKey,
      focus: input.focus.kind,
    });
    write(focusPath, {
      kind: input.focus.kind,
      label: input.focus.label,
      summaryItems: input.focus.summaryItems ?? [],
      ticketEntryPointRelativePath: rootEntryPoint,
      ...(rootAttachmentIndex
        ? { attachmentIndexRelativePath: rootAttachmentIndex.indexRelativePath }
        : {}),
    });
    return buildFocusedTicketContextBundle({
      focus: input.focus,
      files,
      projectId: input.project.id,
      root,
      rootKey,
      rootEntryPoint,
      ...(rootAttachmentIndex
        ? { rootAttachmentIndexRelativePath: rootAttachmentIndex.indexRelativePath }
        : {}),
    });
  }

  return buildWorkItemTicketContextBundle({
    files,
    projectId: input.project.id,
    root,
    rootKey,
    rootEntryPoint,
    ...(rootAttachmentIndex
      ? { rootAttachmentIndexRelativePath: rootAttachmentIndex.indexRelativePath }
      : {}),
    ticketLabel: `${resolveTicketContextKey(input.ticket)} ${input.ticket.ref.title}`,
    ticketSummaryItems: buildJiraWorkItemSummary(input.ticket).summaryItems,
  });
}
