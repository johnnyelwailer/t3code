import type { ReactNode } from "react";
import { useMemo } from "react";
import { T3SurfaceCard, T3SurfaceCardContent } from "~/t3work/components/ui/t3work-surface";
import { createJiraTicketAssetUrlResolver } from "./t3work-ticketAssetUrls";
import { HtmlBlock, MarkdownBlock } from "./t3work-ticketRichContentBlocks";
import { TicketAttachments } from "./t3work-TicketAttachments";
import { TicketComments } from "./t3work-TicketComments";
import type { JiraAttachment, JiraCommentItem } from "./t3work-ticketRichContentTypes";

export function TicketRichContent({
  descriptionMarkdown,
  descriptionHtml,
  htmlBaseUrl,
  projectId,
  ticketKey,
  accountId,
  httpBaseUrl,
  workspaceRoot,
  afterDescription,
  attachments,
  comments,
  onDescriptionContextMenu,
  onAttachmentsContextMenu,
  onCommentsContextMenu,
}: {
  descriptionMarkdown?: string;
  descriptionHtml?: string;
  htmlBaseUrl?: string;
  projectId: string;
  ticketKey: string;
  accountId?: string;
  httpBaseUrl?: string;
  workspaceRoot?: string;
  afterDescription?: ReactNode;
  attachments: JiraAttachment[];
  comments: JiraCommentItem[];
  onDescriptionContextMenu?: (event: React.MouseEvent) => void;
  onAttachmentsContextMenu?: (event: React.MouseEvent) => void;
  onCommentsContextMenu?: (event: React.MouseEvent) => void;
}) {
  const resolveAssetUrl = useMemo(
    () =>
      createJiraTicketAssetUrlResolver({
        projectId,
        ticketKey,
        ...(accountId ? { accountId } : {}),
        ...(httpBaseUrl ? { httpBaseUrl } : {}),
        ...(workspaceRoot ? { workspaceRoot } : {}),
        ...(htmlBaseUrl ? { baseUrl: htmlBaseUrl } : {}),
        attachments,
      }),
    [accountId, attachments, htmlBaseUrl, httpBaseUrl, projectId, ticketKey, workspaceRoot],
  );

  return (
    <div className="space-y-4">
      <div onContextMenu={onDescriptionContextMenu}>
        <T3SurfaceCard>
          <T3SurfaceCardContent className="space-y-3">
            <h3 className="text-sm font-semibold">Description</h3>
            {descriptionHtml ? (
              <HtmlBlock
                content={descriptionHtml}
                {...(htmlBaseUrl ? { baseUrl: htmlBaseUrl } : {})}
                {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
              />
            ) : descriptionMarkdown && descriptionMarkdown.trim().length > 0 ? (
              <MarkdownBlock content={descriptionMarkdown} />
            ) : (
              <p className="text-sm text-muted-foreground">No description available.</p>
            )}
          </T3SurfaceCardContent>
        </T3SurfaceCard>
      </div>

      {afterDescription}

      <div onContextMenu={onAttachmentsContextMenu}>
        <TicketAttachments
          attachments={attachments}
          {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
        />
      </div>
      <div onContextMenu={onCommentsContextMenu}>
        <TicketComments
          comments={comments}
          {...(htmlBaseUrl ? { htmlBaseUrl } : {})}
          {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
        />
      </div>
    </div>
  );
}
