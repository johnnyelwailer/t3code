import type { ReactNode } from "react";
import { useState } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { Button } from "~/t3team/components/ui/t3team-button";
import type { JiraCommentItem } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import { WorkItemCommentComposer } from "~/t3team/workitem/t3team-WorkItemCommentComposer";
import { WorkItemCommentItem } from "~/t3team/workitem/t3team-WorkItemCommentItem";
import { WorkItemCommentRow } from "~/t3team/workitem/t3team-WorkItemCommentRow";
import { WorkItemSection } from "~/t3team/workitem/t3team-WorkItemSection";
import { readTimestampMs } from "~/t3team/workitem/t3team-workItemFieldReaders";

const INITIAL_VISIBLE_COUNT = 5;

/** Newest first, by whichever timestamp Jira actually sent for the comment. */
export function sortWorkItemCommentsNewestFirst(
  comments: ReadonlyArray<JiraCommentItem>,
): ReadonlyArray<JiraCommentItem> {
  return [...comments].sort((a, b) => {
    const aMs = readTimestampMs(a.updated ?? a.created) ?? 0;
    const bMs = readTimestampMs(b.updated ?? b.created) ?? 0;
    return bMs - aMs;
  });
}

/** The arithmetic behind "Show N earlier": already-sorted comments in, visible slice out. */
export function selectVisibleWorkItemComments(
  sorted: ReadonlyArray<JiraCommentItem>,
  expanded: boolean,
): { readonly visible: ReadonlyArray<JiraCommentItem>; readonly hiddenCount: number } {
  if (expanded || sorted.length <= INITIAL_VISIBLE_COUNT) {
    return { visible: sorted, hiddenCount: 0 };
  }
  return {
    visible: sorted.slice(0, INITIAL_VISIBLE_COUNT),
    hiddenCount: sorted.length - INITIAL_VISIBLE_COUNT,
  };
}

/**
 * Newest-first comment thread. Order is evident from the timestamps on each comment, so the
 * heading stays just "Comments" — no "(newest first)" restating what the reader can already see.
 *
 * Long threads collapse to the 5 most recent rather than paginating or scrolling internally: a
 * "Show N earlier" button is a single predictable control, and the whole page already scrolls.
 */
export function WorkItemComments({
  onContextMenu,
  anchorId,
  comments,
  nowMs,
  htmlBaseUrl,
  resolveAssetUrl,
  renderBody,
  backend,
  accountId,
  issueIdOrKey,
  onReload,
}: {
  readonly onContextMenu?: ((event: React.MouseEvent) => void) | undefined;
  /** Section nav target. */
  readonly anchorId?: string | undefined;
  readonly comments: ReadonlyArray<JiraCommentItem>;
  readonly nowMs: number;
  readonly htmlBaseUrl?: string;
  readonly resolveAssetUrl?: (url: string) => string;
  readonly renderBody?: (comment: JiraCommentItem) => ReactNode;
  /** Present only with a live Atlassian connection — absent, the section stays read-only. */
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  readonly issueIdOrKey?: string | undefined;
  readonly onReload?: (() => void) | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const canWrite = Boolean(backend && accountId && issueIdOrKey && onReload);
  if (comments.length === 0 && !canWrite) return null;

  const sorted = sortWorkItemCommentsNewestFirst(comments);
  const { visible, hiddenCount } = selectVisibleWorkItemComments(sorted, expanded);

  return (
    <WorkItemSection
      title="Comments"
      {...(anchorId ? { anchorId } : {})}
      {...(onContextMenu ? { onContextMenu } : {})}
      count={comments.length}
    >
      {canWrite ? (
        <WorkItemCommentComposer
          backend={backend!}
          accountId={accountId!}
          issueIdOrKey={issueIdOrKey!}
          onReload={onReload!}
        />
      ) : null}
      <div className="divide-y divide-border/50">
        {visible.map((comment, index) =>
          canWrite ? (
            <WorkItemCommentRow
              key={comment.id ?? `comment-${index}`}
              backend={backend!}
              accountId={accountId!}
              issueIdOrKey={issueIdOrKey!}
              comment={comment}
              nowMs={nowMs}
              onReload={onReload!}
              {...(htmlBaseUrl ? { htmlBaseUrl } : {})}
              {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
              {...(renderBody ? { renderBody } : {})}
            />
          ) : (
            <WorkItemCommentItem
              key={comment.id ?? `comment-${index}`}
              comment={comment}
              nowMs={nowMs}
              {...(htmlBaseUrl ? { htmlBaseUrl } : {})}
              {...(resolveAssetUrl ? { resolveAssetUrl } : {})}
              {...(renderBody ? { renderBody } : {})}
            />
          ),
        )}
      </div>
      {hiddenCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-1.5"
          onClick={() => setExpanded(true)}
        >
          Show {hiddenCount} earlier
        </Button>
      ) : null}
    </WorkItemSection>
  );
}
