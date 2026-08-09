export type T3TeamMediaKind = "image" | "video" | "audio" | "file";

export type T3TeamMediaKindInput = {
  readonly mimeType?: string | undefined;
  readonly filename?: string | undefined;
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|avi|mkv)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg)$/i;

function extensionOf(filename: string | undefined): string {
  return filename?.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
}

/**
 * Classifies a piece of media into how it should be rendered: a real `<img>`, a `<video>`, an
 * `<audio>` player, or a generic file chip for everything else (pdf, zip, docx, …). Mime type
 * wins when present; the filename extension is the fallback real Jira payloads need when mime
 * type is missing or absent entirely. Shared by the ADF renderer's media node
 * (`t3team-adfMediaResolution.ts`) and the attachment tile glyph picker
 * (`workItemAttachmentGlyph` in `t3team-WorkItemAttachmentTile.tsx`) so "what kind of file is
 * this" has exactly one answer instead of two mime/extension pattern sets drifting apart.
 */
export function classifyMediaKind({ mimeType, filename }: T3TeamMediaKindInput): T3TeamMediaKind {
  const mime = mimeType?.toLowerCase().trim();
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("audio/")) return "audio";

  const ext = extensionOf(filename);
  if (IMAGE_EXT.test(ext)) return "image";
  if (VIDEO_EXT.test(ext)) return "video";
  if (AUDIO_EXT.test(ext)) return "audio";
  return "file";
}
