import type { JiraAttachment } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import { WorkItemAttachmentTile } from "~/t3team/workitem/t3team-WorkItemAttachmentTile";
import { WorkItemSection } from "~/t3team/workitem/t3team-WorkItemSection";

/**
 * The attachment grid: 2 columns narrow, widening as the pane gains room. Every tile resolves its
 * own href/thumbnail through `resolveAssetUrl` (workspace-relative cache paths, signed Jira URLs,
 * whatever the caller's asset resolver does), mirroring the contract the retired
 * `t3team-TicketAttachments.tsx` used.
 */
export function WorkItemAttachments({
  attachments,
  resolveAssetUrl,
  nowMs,
}: {
  readonly attachments: ReadonlyArray<JiraAttachment>;
  readonly resolveAssetUrl?: (url: string) => string;
  readonly nowMs: number;
}) {
  if (attachments.length === 0) return null;

  return (
    <WorkItemSection title="Attachments" count={attachments.length}>
      <div className="grid grid-cols-2 gap-2.5 @lg/workitem:grid-cols-3 @3xl/workitem:grid-cols-4">
        {attachments.map((attachment, index) => {
          const rawHref = attachment.content ?? attachment.thumbnail ?? "";
          const href = rawHref && resolveAssetUrl ? resolveAssetUrl(rawHref) : rawHref;
          const previewSrc = attachment.thumbnail ?? attachment.content ?? "";
          const imageSrc = previewSrc
            ? resolveAssetUrl
              ? resolveAssetUrl(previewSrc)
              : previewSrc
            : undefined;

          return (
            <WorkItemAttachmentTile
              key={attachment.id ?? `${attachment.filename ?? "attachment"}-${index}`}
              attachment={attachment}
              href={href}
              imageSrc={imageSrc}
              nowMs={nowMs}
            />
          );
        })}
      </div>
    </WorkItemSection>
  );
}
