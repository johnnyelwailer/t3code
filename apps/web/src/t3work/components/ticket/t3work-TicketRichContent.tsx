import type { ReactNode } from "react";
import { Badge } from "~/t3work/components/ui/t3work-badge";
import { T3SurfaceCard, T3SurfaceCardContent } from "~/t3work/components/ui/t3work-surface";
import { HtmlBlock, MarkdownBlock } from "./t3work-ticketRichContentBlocks";
import { TicketAttachments } from "./t3work-TicketAttachments";
import { TicketComments } from "./t3work-TicketComments";
import type { JiraAttachment, JiraCommentItem } from "./t3work-ticketRichContentTypes";

export function TicketRichContent({
  descriptionMarkdown,
  descriptionHtml,
  htmlBaseUrl,
  afterDescription,
  attachments,
  comments,
}: {
  descriptionMarkdown?: string;
  descriptionHtml?: string;
  htmlBaseUrl?: string;
  afterDescription?: ReactNode;
  attachments: JiraAttachment[];
  comments: JiraCommentItem[];
}) {
  return (
    <div className="space-y-4">
      <T3SurfaceCard>
        <T3SurfaceCardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Description</h3>
            <Badge variant="outline" className="text-[10px]">
              Jira content
            </Badge>
          </div>
          {descriptionHtml ? (
            <HtmlBlock
              content={descriptionHtml}
              {...(htmlBaseUrl ? { baseUrl: htmlBaseUrl } : {})}
            />
          ) : descriptionMarkdown && descriptionMarkdown.trim().length > 0 ? (
            <MarkdownBlock content={descriptionMarkdown} />
          ) : (
            <p className="text-sm text-muted-foreground">No description available.</p>
          )}
        </T3SurfaceCardContent>
      </T3SurfaceCard>

      {afterDescription}

      <TicketAttachments attachments={attachments} />
      <TicketComments comments={comments} {...(htmlBaseUrl ? { htmlBaseUrl } : {})} />
    </div>
  );
}
