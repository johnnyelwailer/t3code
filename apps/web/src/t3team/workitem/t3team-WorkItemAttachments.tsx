import { useMemo } from "react";

import { T3TeamImageLightbox } from "~/t3team/components/media/t3team-ImageLightbox";
import type { T3TeamLightboxImage } from "~/t3team/components/media/t3team-imageLightboxState";
import { useT3TeamImageLightbox } from "~/t3team/components/media/t3team-useImageLightbox";
import type { JiraAttachment } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import { WorkItemAttachmentTile } from "~/t3team/workitem/t3team-WorkItemAttachmentTile";
import { WorkItemSection } from "~/t3team/workitem/t3team-WorkItemSection";

type ResolvedAttachment = {
  readonly attachment: JiraAttachment;
  readonly href: string;
  readonly imageSrc: string | undefined;
  /** Index into the image-only gallery, or `undefined` when this isn't an image attachment. */
  readonly galleryIndex: number | undefined;
};

function resolveAttachments(
  attachments: ReadonlyArray<JiraAttachment>,
  resolveAssetUrl: ((url: string) => string) | undefined,
): ResolvedAttachment[] {
  let nextGalleryIndex = 0;
  return attachments.map((attachment) => {
    const rawHref = attachment.content ?? attachment.thumbnail ?? "";
    const href = rawHref && resolveAssetUrl ? resolveAssetUrl(rawHref) : rawHref;
    const previewSrc = attachment.thumbnail ?? attachment.content ?? "";
    const imageSrc = previewSrc
      ? resolveAssetUrl
        ? resolveAssetUrl(previewSrc)
        : previewSrc
      : undefined;
    const isImage = imageSrc !== undefined && (attachment.mimeType ?? "").startsWith("image/");
    const galleryIndex = isImage ? nextGalleryIndex++ : undefined;
    return { attachment, href, imageSrc, galleryIndex };
  });
}

/**
 * The attachment grid: 2 columns narrow, widening as the pane gains room. Every tile resolves its
 * own href/thumbnail through `resolveAssetUrl` (workspace-relative cache paths, signed Jira URLs,
 * whatever the caller's asset resolver does), mirroring the contract the retired
 * `t3team-TicketAttachments.tsx` used. Image attachments share the same lightbox the ADF
 * description uses, since a screenshot attached to a bug report is the same kind of content.
 */
export function WorkItemAttachments({
  onContextMenu,
  anchorId,
  attachments,
  resolveAssetUrl,
  nowMs,
}: {
  readonly onContextMenu?: ((event: React.MouseEvent) => void) | undefined;
  /** Section nav target. */
  readonly anchorId?: string | undefined;
  readonly attachments: ReadonlyArray<JiraAttachment>;
  readonly resolveAssetUrl?: (url: string) => string;
  readonly nowMs: number;
}) {
  const resolved = useMemo(
    () => resolveAttachments(attachments, resolveAssetUrl),
    [attachments, resolveAssetUrl],
  );
  const galleryImages = useMemo<T3TeamLightboxImage[]>(
    () =>
      resolved
        .filter((entry) => entry.galleryIndex !== undefined)
        .map((entry) => ({
          src: entry.imageSrc ?? "",
          alt: entry.attachment.filename?.trim() || "Attachment",
          href: entry.href || entry.imageSrc,
        })),
    [resolved],
  );
  const lightbox = useT3TeamImageLightbox(galleryImages);

  if (attachments.length === 0) return null;

  return (
    <WorkItemSection
      title="Attachments"
      {...(anchorId ? { anchorId } : {})}
      {...(onContextMenu ? { onContextMenu } : {})}
      count={attachments.length}
    >
      <div className="grid grid-cols-2 gap-2.5 @lg/workitem:grid-cols-3 @3xl/workitem:grid-cols-4">
        {resolved.map((entry, index) => (
          <WorkItemAttachmentTile
            key={entry.attachment.id ?? `${entry.attachment.filename ?? "attachment"}-${index}`}
            attachment={entry.attachment}
            href={entry.href}
            imageSrc={entry.imageSrc}
            nowMs={nowMs}
            onOpenImage={
              entry.galleryIndex === undefined
                ? undefined
                : () => lightbox.openAt(entry.galleryIndex!)
            }
          />
        ))}
      </div>
      <T3TeamImageLightbox
        images={galleryImages}
        index={lightbox.index}
        onClose={lightbox.close}
        onNext={lightbox.next}
        onPrev={lightbox.prev}
      />
    </WorkItemSection>
  );
}
