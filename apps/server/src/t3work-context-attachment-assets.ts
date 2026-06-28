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

import { hashT3workContextBytes } from "./t3work-context-blob-store.ts";

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

type Attachment = {
  readonly id?: string;
  readonly filename: string;
  readonly mimeType?: string;
  readonly content?: string;
  readonly thumbnail?: string;
  readonly size?: number;
};

function readAttachments(snapshot: ResourceSnapshot): Attachment[] {
  const attachments = (snapshot.fields as Record<string, unknown>).attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }
  return attachments.flatMap((value) => {
    if (!value || typeof value !== "object") {
      return [];
    }
    const record = value as Record<string, unknown>;
    const filename = typeof record.filename === "string" ? record.filename : undefined;
    const id = typeof record.id === "string" ? record.id : undefined;
    if (!filename && !id) {
      return [];
    }
    return [
      {
        ...(id ? { id } : {}),
        filename: sanitizeAttachmentFileName(
          filename ?? id!,
          typeof record.mimeType === "string" ? record.mimeType : undefined,
        ),
        ...(typeof record.mimeType === "string" ? { mimeType: record.mimeType } : {}),
        ...(typeof record.content === "string" ? { content: record.content } : {}),
        ...(typeof record.thumbnail === "string" ? { thumbnail: record.thumbnail } : {}),
        ...(typeof record.size === "number" ? { size: record.size } : {}),
      },
    ];
  });
}

function sanitizeAttachmentFileName(filename: string, mimeType?: string): string {
  const extension =
    filename.match(/\.[a-z0-9]{1,12}$/i)?.[0]?.toLowerCase() ?? inferExtension(mimeType);
  const base = (
    extension && filename.endsWith(extension) ? filename.slice(0, -extension.length) : filename
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base.length > 0 ? base : "attachment"}${extension}`;
}

function inferExtension(mimeType?: string): string {
  switch (mimeType?.toLowerCase()) {
    case "application/json":
      return ".json";
    case "application/pdf":
      return ".pdf";
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "text/plain":
      return ".txt";
    default:
      return "";
  }
}

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
      for (const attachment of readAttachments(snapshot)) {
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
