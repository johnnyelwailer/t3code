import type { ReactNode } from "react";

import {
  HtmlBlock,
  MarkdownBlock,
} from "~/t3team/components/ticket/t3team-ticketRichContentBlocks";
import type { JiraCommentItem } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import { cn } from "~/t3team/lib/t3team-utils";
import { proxyAtlassianAssetUrl } from "~/t3team/t3team-atlassianAssetUrls";
import { WorkItemDate } from "~/t3team/workitem/t3team-WorkItemDate";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";
import { readTimestampMs } from "~/t3team/workitem/t3team-workItemFieldReaders";

/** Below this gap, `updated` is clock noise from the create call itself, not a real edit. */
const EDIT_GRACE_MS = 60_000;

export function isWorkItemCommentEdited(comment: JiraCommentItem): boolean {
  const createdMs = readTimestampMs(comment.created);
  const updatedMs = readTimestampMs(comment.updated);
  if (createdMs === undefined || updatedMs === undefined) return false;
  return updatedMs - createdMs > EDIT_GRACE_MS;
}

/**
 * One comment: author, relative time, an "edited" marker when it earns one, and the body.
 *
 * `renderBody` lets the ADF renderer (Slice C) take over body rendering without this component
 * knowing ADF exists; absent that, it falls back to the same HTML/markdown path the retired
 * `t3team-TicketComments.tsx` used. Internal/JSD-private comments get a quiet accent border rather
 * than a coloured background, so a thread of mixed public/internal comments still reads as one
 * conversation instead of alternating card colours.
 */
export function WorkItemCommentItem({
  comment,
  nowMs,
  htmlBaseUrl,
  resolveAssetUrl,
  renderBody,
  accountId,
  className,
}: {
  readonly comment: JiraCommentItem;
  readonly nowMs: number;
  readonly htmlBaseUrl?: string;
  readonly resolveAssetUrl?: (url: string) => string;
  readonly renderBody?: (comment: JiraCommentItem) => ReactNode;
  /** The Atlassian connection's account id — routes the author avatar through the asset proxy. */
  readonly accountId?: string | undefined;
  readonly className?: string;
}) {
  const timestampMs = readTimestampMs(comment.updated ?? comment.created);
  const edited = isWorkItemCommentEdited(comment);
  const commentHtml = comment.bodyHtml?.trim() ?? "";
  const commentMarkdown = comment.bodyMarkdown?.trim() ?? "";
  const authorAvatarUrl = proxyAtlassianAssetUrl({ url: comment.authorAvatarUrl, accountId });
  const author = comment.author
    ? {
        displayName: comment.author,
        ...(comment.authorAccountId ? { accountId: comment.authorAccountId } : {}),
        ...(authorAvatarUrl ? { avatarUrl: authorAvatarUrl } : {}),
      }
    : undefined;

  return (
    <div
      className={cn(
        "flex min-w-0 gap-2.5 border-l-2 border-transparent py-2.5",
        comment.isInternal && "border-warning/60 pl-2.5",
        className,
      )}
    >
      <WorkItemPersonAvatar person={author} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
          <span className="font-medium text-foreground">{comment.author ?? "Unknown"}</span>
          {timestampMs !== undefined ? (
            <WorkItemDate
              timestampMs={timestampMs}
              nowMs={nowMs}
              className="text-muted-foreground"
            />
          ) : null}
          {edited ? <span className="text-muted-foreground">(edited)</span> : null}
        </div>

        {/*
          `renderBody` may return nothing to defer to the fallback chain. Comments arrive mixed —
          some carry ADF, older cached ones only markdown — so a renderer that handles one form has
          to be able to pass on the others rather than blanking the body.
        */}
        {renderBody?.(comment) ??
          (commentHtml ? (
            <HtmlBlock
              content={commentHtml}
              {...(htmlBaseUrl ? { baseUrl: htmlBaseUrl } : {})}
              {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
            />
          ) : commentMarkdown ? (
            <MarkdownBlock content={commentMarkdown} />
          ) : null)}
      </div>
    </div>
  );
}
