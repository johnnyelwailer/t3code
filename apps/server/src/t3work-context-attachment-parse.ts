import type { ResourceSnapshot } from "@t3tools/project-context";

export type T3workContextAttachmentRecord = {
  readonly id?: string;
  readonly filename: string;
  readonly mimeType?: string;
  readonly content?: string;
  readonly thumbnail?: string;
  readonly size?: number;
};

export function readT3workContextAttachments(
  snapshot: ResourceSnapshot,
): T3workContextAttachmentRecord[] {
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
        filename: sanitizeT3workContextAttachmentFileName(
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

function sanitizeT3workContextAttachmentFileName(filename: string, mimeType?: string): string {
  const extension =
    filename.match(/\.[a-z0-9]{1,12}$/i)?.[0]?.toLowerCase() ??
    inferT3workContextAttachmentExtension(mimeType);
  const base = (
    extension && filename.endsWith(extension) ? filename.slice(0, -extension.length) : filename
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base.length > 0 ? base : "attachment"}${extension}`;
}

function inferT3workContextAttachmentExtension(mimeType?: string): string {
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
