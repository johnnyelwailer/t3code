import { Archive, File, FileCode, FileText, Film, Image as ImageIcon, Music } from "lucide-react";
import { useState } from "react";

import type { JiraAttachment } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import { formatFileSize } from "~/t3team/components/ticket/t3team-ticketRichContentUtils";
import { classifyMediaKind } from "~/t3team/lib/t3team-mediaKind";
import { cn } from "~/t3team/lib/t3team-utils";
import { WorkItemDate } from "~/t3team/workitem/t3team-WorkItemDate";
import { readTimestampMs } from "~/t3team/workitem/t3team-workItemFieldReaders";

type GlyphAttachment = Pick<JiraAttachment, "mimeType" | "filename">;

const ARCHIVE_MIME = /(zip|tar|gzip|7z|rar)/;
const ARCHIVE_EXT = /\.(zip|tar|gz|7z|rar)$/;
const CODE_MIME = /(json|xml|yaml)/;
const CODE_EXT = /\.(js|ts|tsx|jsx|json|ya?ml|py|java|go|rb|css|html?|md|sh)$/;

/**
 * Chooses a glyph for a non-image attachment from its mime type, falling back to the file
 * extension when Jira didn't send one. Video/audio detection is shared with the ADF media
 * renderer via `classifyMediaKind` — one mime/extension mapping, not two drifting copies. One
 * function, one place, so the tile and its empty/error states always agree on what a given
 * attachment "looks like".
 */
export function workItemAttachmentGlyph(attachment: GlyphAttachment): typeof File {
  const mime = attachment.mimeType?.toLowerCase() ?? "";
  const ext = attachment.filename?.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";

  if (mime === "application/pdf" || ext === ".pdf") return FileText;
  const kind = classifyMediaKind(attachment);
  if (kind === "video") return Film;
  if (kind === "audio") return Music;
  if (ARCHIVE_MIME.test(mime) || ARCHIVE_EXT.test(ext)) return Archive;
  if (mime.startsWith("text/") || CODE_MIME.test(mime) || CODE_EXT.test(ext)) return FileCode;
  return File;
}

/**
 * Whether the tile should attempt an image thumbnail: only for image mime types with a resolved
 * `imageSrc`, and only until the `<img>` reports a load failure via `onError`. Extracted as a pure
 * predicate so the fallback path is directly testable without simulating a DOM error event.
 */
export function shouldShowAttachmentThumbnail(input: {
  readonly isImageMime: boolean;
  readonly hasImageSrc: boolean;
  readonly imageFailed: boolean;
}): boolean {
  return input.isImageMime && input.hasImageSrc && !input.imageFailed;
}

/**
 * One attachment: a real thumbnail for images, a mime/extension glyph for everything else. The
 * whole tile is a link — attachments open in a new tab rather than a preview modal, since Jira
 * attachments are frequently large binaries the browser is better equipped to handle natively.
 */
export function WorkItemAttachmentTile({
  attachment,
  href,
  imageSrc,
  nowMs,
  className,
  onOpenImage,
}: {
  readonly attachment: JiraAttachment;
  readonly href: string;
  readonly imageSrc: string | undefined;
  readonly nowMs: number;
  readonly className?: string;
  /** Present only for image attachments: opens the shared lightbox instead of a new tab. */
  readonly onOpenImage?: (() => void) | undefined;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const name = attachment.filename?.trim() || "Attachment";
  const isImageMime = (attachment.mimeType ?? "").startsWith("image/");
  const showThumbnail = shouldShowAttachmentThumbnail({
    isImageMime,
    hasImageSrc: Boolean(imageSrc),
    imageFailed,
  });
  const Glyph = isImageMime ? ImageIcon : workItemAttachmentGlyph(attachment);
  const sizeText = formatFileSize(attachment.size);
  const createdMs = readTimestampMs(attachment.created);

  const tileClassName = cn(
    "flex min-w-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card/40 text-left transition-colors hover:bg-accent/30",
    className,
  );

  const tileBody = (
    <>
      <div className="flex aspect-video items-center justify-center overflow-hidden bg-muted/30">
        {showThumbnail ? (
          <img
            src={imageSrc}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="size-full object-cover"
          />
        ) : (
          <Glyph className="size-6 text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 space-y-0.5 p-2">
        <p className="truncate text-xs font-medium text-foreground">{name}</p>
        <div className="flex min-w-0 items-center gap-1 text-[0.6875rem] text-muted-foreground">
          {sizeText ? <span className="shrink-0">{sizeText}</span> : null}
          {attachment.author ? (
            <span className="hidden min-w-0 truncate @lg/workitem:inline">
              {sizeText ? "· " : ""}
              {attachment.author}
            </span>
          ) : null}
          {createdMs !== undefined ? (
            <WorkItemDate
              timestampMs={createdMs}
              nowMs={nowMs}
              className="hidden shrink-0 @lg/workitem:ml-auto @lg/workitem:inline"
            />
          ) : null}
        </div>
      </div>
    </>
  );

  // Images open in the shared lightbox — that's the same content a description image is.
  // Everything else stays a plain new-tab link; large binaries are better handled natively.
  if (isImageMime && onOpenImage) {
    return (
      <button type="button" title={name} className={tileClassName} onClick={onOpenImage}>
        {tileBody}
      </button>
    );
  }

  return (
    <a href={href || undefined} target="_blank" rel="noreferrer" title={name} className={tileClassName}>
      {tileBody}
    </a>
  );
}
