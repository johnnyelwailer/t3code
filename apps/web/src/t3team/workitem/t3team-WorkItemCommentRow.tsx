import { Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { T3TeamErrorStateInline } from "~/t3team/components/error/t3team-ErrorStateInline";
import { Button } from "~/t3team/components/ui/t3team-button";
import type { JiraCommentItem } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import { useWorkItemFieldMutation } from "~/t3team/workitem/t3team-useWorkItemFieldMutation";
import { WorkItemCommentEditForm } from "~/t3team/workitem/t3team-WorkItemCommentEditForm";
import { WorkItemCommentItem } from "~/t3team/workitem/t3team-WorkItemCommentItem";
import { WorkItemFieldUndoBanner } from "~/t3team/workitem/t3team-WorkItemFieldOverlay";

/**
 * Wraps the read-only `WorkItemCommentItem` with edit/delete, each going through
 * `useWorkItemFieldMutation` so optimistic apply, rollback and the 10s undo match every other
 * field control in this view — direct edits and accepted agent drafts both end up here.
 *
 * Jira has no "undo delete" endpoint, so a delete's undo re-posts the same body as a new comment
 * through the same create path the composer uses, rather than pretending to restore the original.
 */
export function WorkItemCommentRow({
  backend,
  accountId,
  issueIdOrKey,
  comment,
  nowMs,
  htmlBaseUrl,
  resolveAssetUrl,
  renderBody,
  onReload,
}: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly comment: JiraCommentItem;
  readonly nowMs: number;
  readonly htmlBaseUrl?: string;
  readonly resolveAssetUrl?: (url: string) => string;
  readonly renderBody?: (comment: JiraCommentItem) => ReactNode;
  readonly onReload: () => void;
}) {
  const commentId = comment.id;
  const initialBody = comment.bodyMarkdown ?? "";
  const [editing, setEditing] = useState(false);

  const editMutation = useWorkItemFieldMutation<string>({
    value: initialBody,
    action: "editing the comment",
    mutate: async (body) => {
      if (!commentId) return;
      await backend.updateIssueComment({ accountId, issueIdOrKey, commentId, body });
      onReload();
    },
  });

  const visibleMutation = useWorkItemFieldMutation<boolean>({
    value: true,
    action: "deleting the comment",
    mutate: async (visible) => {
      if (!commentId) return;
      if (visible) {
        // Undo: re-fetch afterwards so the recreated comment's real id/timestamp replace the
        // optimistic guess.
        await backend.addIssueComment({ accountId, issueIdOrKey, body: initialBody });
        onReload();
      } else {
        // Deliberately no `onReload()` here: reloading would drop this comment from the parent's
        // list immediately, unmounting this row (and the undo banner it's about to show) before
        // the 10s undo window ever gets a chance to display. The optimistic `visible: false`
        // stays authoritative in this session until some other action reloads the thread.
        await backend.deleteIssueComment({ accountId, issueIdOrKey, commentId });
      }
    },
  });

  const commentProps = {
    comment: { ...comment, bodyMarkdown: editMutation.value },
    nowMs,
    accountId,
    ...(htmlBaseUrl ? { htmlBaseUrl } : {}),
    ...(resolveAssetUrl ? { resolveAssetUrl } : {}),
    ...(renderBody ? { renderBody } : {}),
  };

  if (!commentId) {
    return <WorkItemCommentItem {...commentProps} />;
  }

  if (!visibleMutation.value) {
    // Once the undo window closes, the row just goes quiet rather than offering a stale action —
    // matching the 10s window every other field control in this view already uses.
    if (!visibleMutation.lastChange) return null;
    return (
      <div className="py-2.5">
        <WorkItemFieldUndoBanner label="Comment deleted" onUndo={visibleMutation.undo} />
      </div>
    );
  }

  const busy = editMutation.pending || visibleMutation.pending;

  return (
    <div className="group/comment-row relative">
      {editing ? (
        <div className="py-2.5">
          <WorkItemCommentEditForm
            initialBody={editMutation.value}
            pending={editMutation.pending}
            onCancel={() => setEditing(false)}
            onSave={(body) => {
              editMutation.commit(body);
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <>
          <WorkItemCommentItem {...commentProps} />
          <div className="absolute right-0 top-2 hidden items-center gap-1 group-hover/comment-row:flex">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={busy}
              aria-label="Edit comment"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={busy}
              aria-label="Delete comment"
              onClick={() => visibleMutation.commit(false)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </>
      )}
      {editMutation.error ? (
        <T3TeamErrorStateInline userFacing={editMutation.error} showRetry={false} />
      ) : null}
      {visibleMutation.error ? (
        <T3TeamErrorStateInline userFacing={visibleMutation.error} showRetry={false} />
      ) : null}
    </div>
  );
}
