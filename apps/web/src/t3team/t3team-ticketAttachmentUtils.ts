import type { JiraAttachment } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import { buildJiraTicketAttachmentAssetPath } from "~/t3team/t3team-contextCachePaths";

export function normalizeTicketAttachments(
  attachments: Array<Record<string, unknown>>,
): JiraAttachment[] {
  return attachments.map((attachment) => ({
    id: typeof attachment.id === "string" ? attachment.id : undefined,
    filename: typeof attachment.filename === "string" ? attachment.filename : undefined,
    mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType : undefined,
    content: typeof attachment.content === "string" ? attachment.content : undefined,
    thumbnail: typeof attachment.thumbnail === "string" ? attachment.thumbnail : undefined,
    size: typeof attachment.size === "number" ? attachment.size : undefined,
  }));
}

function inferFileExtension(mimeType?: string): string {
  switch (mimeType?.toLowerCase()) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "application/pdf":
      return ".pdf";
    case "text/plain":
      return ".txt";
    case "application/json":
      return ".json";
    default:
      return "";
  }
}

export function sanitizeTicketAttachmentFileName(input: {
  filename?: string;
  attachmentId?: string;
  mimeType?: string;
}): string {
  const trimmed = input.filename?.trim() ?? "";
  const extensionMatch = trimmed.match(/\.[a-z0-9]{1,12}$/i)?.[0]?.toLowerCase();
  const extension = extensionMatch ?? inferFileExtension(input.mimeType);
  const rawBase = extensionMatch ? trimmed.slice(0, -extensionMatch.length) : trimmed;
  const fallback = input.attachmentId?.trim() || "attachment";
  const base = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base.length > 0 ? base : fallback}${extension}`;
}

export function buildTicketAttachmentCacheRelativePath(input: {
  projectId: string;
  ticketKey: string;
  attachment: JiraAttachment;
}): string {
  const filename = sanitizeTicketAttachmentFileName({
    ...(input.attachment.filename ? { filename: input.attachment.filename } : {}),
    ...(input.attachment.id ? { attachmentId: input.attachment.id } : {}),
    ...(input.attachment.mimeType ? { mimeType: input.attachment.mimeType } : {}),
  });

  return buildJiraTicketAttachmentAssetPath({
    projectId: input.projectId,
    ticketKey: input.ticketKey,
    ...(input.attachment.id ? { attachmentId: input.attachment.id } : {}),
    filename,
  });
}
