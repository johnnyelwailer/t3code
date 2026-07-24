import type { ResourceSnapshot } from "@t3tools/project-context";
import { T3TEAM_CONTEXT_AVAILABILITY_FULL } from "@t3tools/project-context/t3teamContextAvailability";
import {
  buildContextManifestPath,
  buildContextMetadataPath,
  buildJiraTicketCacheRoot,
  buildJiraTicketEntryPoint,
} from "@t3tools/project-context/t3teamContextPaths";
import {
  compactJson,
  type T3TeamDirectoryBundleFile,
} from "@t3tools/project-context/t3teamDirectoryBundle";
import * as DateTime from "effect/DateTime";

import type { T3TeamContextAttachmentIndexInfo } from "./t3team-context-attachment-assets.ts";
import {
  buildT3TeamContextTicketSummary,
  resolveT3TeamContextTicketKey,
  type T3TeamContextTicket,
} from "./t3team-context-ticket.ts";

export type T3TeamContextGraphNode = {
  readonly key: string;
  readonly depth: number;
  readonly ticket: T3TeamContextTicket | null;
  readonly snapshot: ResourceSnapshot | null;
  readonly relationshipKeys: {
    readonly parentKey?: string;
    readonly childKeys: ReadonlyArray<string>;
    readonly referenceKeys: ReadonlyArray<string>;
  };
  readonly error?: string;
};

export type T3TeamWorkItemBundleBuildResult = {
  readonly files: ReadonlyArray<T3TeamDirectoryBundleFile>;
  readonly rootEntryPointRelativePath: string;
  readonly rootManifestRelativePath: string;
  readonly includedCount: number;
  readonly skippedCount: number;
};

function writeJson(files: T3TeamDirectoryBundleFile[], relativePath: string, value: unknown): void {
  files.push({ relativePath, contents: compactJson(value) });
}

function directLinks(input: { readonly projectId: string; readonly node: T3TeamContextGraphNode }) {
  return [
    ...(input.node.relationshipKeys.parentKey
      ? [{ relation: "parent", key: input.node.relationshipKeys.parentKey }]
      : []),
    ...input.node.relationshipKeys.childKeys.map((key) => ({ relation: "child", key })),
    ...input.node.relationshipKeys.referenceKeys.map((key) => ({ relation: "reference", key })),
  ].map((link) => ({
    relation: link.relation,
    key: link.key,
    entryPointRelativePath: buildJiraTicketEntryPoint(input.projectId, link.key),
  }));
}

export function buildT3TeamWorkItemContextBundle(input: {
  readonly projectId: string;
  readonly rootKey: string;
  readonly nodes: ReadonlyArray<T3TeamContextGraphNode>;
  readonly attachmentFiles: ReadonlyArray<T3TeamDirectoryBundleFile>;
  readonly attachmentIndexes: ReadonlyMap<string, T3TeamContextAttachmentIndexInfo>;
}): T3TeamWorkItemBundleBuildResult {
  const syncedAt = DateTime.formatIso(DateTime.nowUnsafe());
  const files: T3TeamDirectoryBundleFile[] = [];
  const root = buildJiraTicketCacheRoot(input.projectId, input.rootKey);
  const rootEntryPointRelativePath = buildJiraTicketEntryPoint(input.projectId, input.rootKey);
  const rootManifestRelativePath = buildContextManifestPath(root);

  for (const node of input.nodes) {
    const nodeRoot = buildJiraTicketCacheRoot(input.projectId, node.key);
    writeJson(files, buildContextMetadataPath(nodeRoot), {
      key: node.key,
      ticket: node.ticket,
      ...(node.snapshot ? { snapshotRef: node.snapshot.ref } : {}),
      ...(node.error ? { error: node.error } : {}),
    });
    writeJson(files, `${nodeRoot}/relationships.json`, node.relationshipKeys);
    if (node.snapshot) {
      writeJson(files, `${nodeRoot}/snapshot.json`, node.snapshot);
    }
  }

  files.push(...input.attachmentFiles);

  for (const node of input.nodes) {
    const nodeRoot = buildJiraTicketCacheRoot(input.projectId, node.key);
    const entryPoint = buildJiraTicketEntryPoint(input.projectId, node.key);
    const attachmentIndex = input.attachmentIndexes.get(node.key);
    const links = directLinks({ projectId: input.projectId, node });
    const title = node.ticket?.ref.title ?? node.snapshot?.ref.title ?? node.key;
    const summaryItems = node.ticket ? buildT3TeamContextTicketSummary(node.ticket) : [];
    writeJson(files, buildContextManifestPath(nodeRoot), {
      kind: "jira-work-item-context-manifest",
      syncedAt,
      availability: T3TEAM_CONTEXT_AVAILABILITY_FULL,
      bundleDepth: node.depth === 0 ? "direct" : "node",
      key: node.key,
      title,
      sourceUpdatedAt: node.ticket?.updatedAt ?? node.snapshot?.ref.updatedAt ?? null,
      entryPointRelativePath: entryPoint,
      directLinks: links,
      ...(attachmentIndex
        ? {
            attachmentCount: attachmentIndex.attachmentCount,
            attachmentDownloadFailures: attachmentIndex.failedCount,
          }
        : {}),
    });
    writeJson(files, entryPoint, {
      kind: "jira-work-item",
      availability: T3TEAM_CONTEXT_AVAILABILITY_FULL,
      bundleDepth: node.depth === 0 ? "direct" : "node",
      key: node.key,
      label: node.ticket
        ? `${resolveT3TeamContextTicketKey(node.ticket)} ${node.ticket.ref.title}`
        : title,
      summaryItems,
      paths: {
        manifest: buildContextManifestPath(nodeRoot),
        metadata: buildContextMetadataPath(nodeRoot),
        relationships: `${nodeRoot}/relationships.json`,
        ...(node.snapshot ? { snapshot: `${nodeRoot}/snapshot.json` } : {}),
        ...(attachmentIndex ? { attachments: attachmentIndex.indexRelativePath } : {}),
      },
      directLinks: links,
      ...(attachmentIndex
        ? {
            attachmentSummary: {
              count: attachmentIndex.attachmentCount,
              failedCount: attachmentIndex.failedCount,
            },
          }
        : {}),
    });
  }

  return {
    files,
    rootEntryPointRelativePath,
    rootManifestRelativePath,
    includedCount: input.nodes.length,
    skippedCount: 0,
  };
}
