import { MessageSquare } from "lucide-react";
import {
  T3SurfaceCard,
  T3SurfaceCardContent,
  T3SurfacePanel,
} from "~/t3work/components/ui/t3work-surface";
import { HtmlBlock, MarkdownBlock } from "./t3work-ticketRichContentBlocks";
import type { JiraCommentItem } from "./t3work-ticketRichContentTypes";
import { formatTimestamp } from "./t3work-ticketRichContentUtils";

export function TicketComments({
  comments,
  htmlBaseUrl,
}: {
  comments: JiraCommentItem[];
  htmlBaseUrl?: string;
}) {
  if (comments.length === 0) return null;

  return (
    <T3SurfaceCard>
      <T3SurfaceCardContent className="space-y-4">
        <h3 className="text-sm font-semibold">Comments (newest first)</h3>
        <div className="space-y-4">
          {comments.map((comment, index) => {
            const commentBody = comment.bodyMarkdown?.trim() ?? "";
            const commentHtml = comment.bodyHtml?.trim() ?? "";
            const timestamp = formatTimestamp(comment.updated || comment.created);

            return (
              <T3SurfacePanel
                key={`${comment.id ?? "comment"}-${index}`}
                tone="default"
                className="rounded-lg bg-background/88 p-3"
              >
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <MessageSquare className="size-3.5" />
                  <span className="font-medium text-foreground">{comment.author ?? "Unknown"}</span>
                  {timestamp && (
                    <>
                      <span>•</span>
                      <time>{timestamp}</time>
                    </>
                  )}
                </div>
                {commentHtml ? (
                  <HtmlBlock
                    content={commentHtml}
                    {...(htmlBaseUrl ? { baseUrl: htmlBaseUrl } : {})}
                  />
                ) : commentBody ? (
                  <MarkdownBlock content={commentBody} />
                ) : (
                  <p className="text-sm text-muted-foreground">No comment body.</p>
                )}
              </T3SurfacePanel>
            );
          })}
        </div>
      </T3SurfaceCardContent>
    </T3SurfaceCard>
  );
}
