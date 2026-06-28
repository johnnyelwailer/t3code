import type { ResourceSnapshot } from "@t3tools/project-context";
import {
  compactJson,
  type T3WorkDirectoryBundleFile,
} from "@t3tools/project-context/t3workDirectoryBundle";
import {
  buildJiraTicketAttachmentAssetPath,
  buildJiraTicketAttachmentsIndexPath,
} from "@t3tools/project-context/t3workContextPaths";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { readT3workContextAttachments } from "./t3work-context-attachment-parse.ts";
import { hashT3workContextBytes } from "./t3work-context-blob-store-utils.ts";

type AssetProvider = {
  readonly downloadAsset: (
    url: string,
  ) => Promise<{ readonly bytes: Uint8Array; readonly mimeType?: string }>;
};

export type T3workContextAttachmentIndexInfo = {
  readonly indexRelativePath: string;
  readonly attachmentCount: number;
  readonly downloadedCount: number;
  readonly failedCount: number;
};

export function buildT3workContextAttachmentAssets(input: {
  readonly provider: AssetProvider;
  readonly projectId: string;
  readonly snapshotsByKey: ReadonlyMap<string, ResourceSnapshot>;
}) {
  return Effect.gen(function* () {
    const files: T3WorkDirectoryBundleFile[] = [];
    const byTicketKey = new Map<string, T3workContextAttachmentIndexInfo>();
    const bytesByHash = new Map<
      string,
      { readonly relativePath: string; readonly sizeBytes: number }
    >();
    const syncedAt = DateTime.formatIso(yield* DateTime.now);
    for (const [ticketKey, snapshot] of input.snapshotsByKey) {
      const indexRelativePath = buildJiraTicketAttachmentsIndexPath(input.projectId, ticketKey);
      const entries: unknown[] = [];
      for (const attachment of readT3workContextAttachments(snapshot)) {
        const sourceUrl = attachment.content?.trim() || attachment.thumbnail?.trim();
        if (!sourceUrl) {
          continue;
        }
        const assetRelativePath = buildJiraTicketAttachmentAssetPath({
          projectId: input.projectId,
          ticketKey,
          ...(attachment.id ? { attachmentId: attachment.id } : {}),
          filename: attachment.filename,
        });
        const asset = yield* Effect.match(
          Effect.promise(() => input.provider.downloadAsset(sourceUrl)),
          {
            onFailure: (left) => ({ _tag: "Left" as const, left }),
            onSuccess: (right) => ({ _tag: "Right" as const, right }),
          },
        );
        if (asset._tag === "Right") {
          const bytes = asset.right.bytes;
          const sha256 = hashT3workContextBytes(bytes);
          const deduped = bytesByHash.get(sha256);
          const resolvedPath = deduped?.relativePath ?? assetRelativePath;
          if (!deduped) {
            bytesByHash.set(sha256, {
              relativePath: assetRelativePath,
              sizeBytes: bytes.byteLength,
            });
            files.push({
              relativePath: assetRelativePath,
              contents: Buffer.from(bytes).toString("base64"),
              encoding: "base64",
              sizeBytes: bytes.byteLength,
            });
          }
          entries.push({
            ...(attachment.id ? { id: attachment.id } : {}),
            filename: attachment.filename,
            ...((attachment.mimeType ?? asset.right.mimeType)
              ? { mimeType: attachment.mimeType ?? asset.right.mimeType }
              : {}),
            sourceUrl,
            status: "downloaded",
            localPath: resolvedPath,
            sizeBytes: deduped?.sizeBytes ?? bytes.byteLength,
          });
          continue;
        }
        entries.push({
          ...(attachment.id ? { id: attachment.id } : {}),
          filename: attachment.filename,
          ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
          sourceUrl,
          status: "failed",
          error: String(asset.left),
        });
      }
      if (entries.length === 0) {
        continue;
      }
      const downloadedCount = entries.filter(
        (entry) => (entry as { status?: string }).status === "downloaded",
      ).length;
      files.push({
        relativePath: indexRelativePath,
        contents: compactJson({
          kind: "jira-ticket-attachments-index",
          syncedAt,
          ticketKey,
          attachmentCount: entries.length,
          downloadedCount,
          failedCount: entries.length - downloadedCount,
          attachments: entries,
        }),
      });
      byTicketKey.set(ticketKey, {
        indexRelativePath,
        attachmentCount: entries.length,
        downloadedCount,
        failedCount: entries.length - downloadedCount,
      });
    }
    return { files, byTicketKey };
  });
}
