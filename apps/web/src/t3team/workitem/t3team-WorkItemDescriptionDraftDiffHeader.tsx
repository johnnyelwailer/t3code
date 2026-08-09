/**
 * The action bar of an in-place description review: what changed, and the three things you can do about it.
 *
 * Split from `t3team-WorkItemDescriptionDraftDiff` so that file stays under the 200-line cap once Accept
 * became a real write path.
 *
 * "Comment" is the one that reads wrong without help: it RETURNS the draft with your notes, so it is
 * disabled until there is at least one — and notes are made by selecting text in the proposal below, which
 * nothing on screen would otherwise tell you. Hence the title.
 */

import { Bot, Check, ChevronUp, MessageSquare, X } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";

export function WorkItemDescriptionDraftDiffHeader({
  added,
  removed,
  commentCount,
  acceptDisabled,
  acceptReason,
  onSendBack,
  onDismiss,
  onAccept,
  onCollapse,
}: {
  readonly added: number;
  readonly removed: number;
  readonly commentCount: number;
  readonly acceptDisabled: boolean;
  /** Why Accept is unavailable, when it is unavailable for a reason the reader can act on. */
  readonly acceptReason?: string | undefined;
  readonly onSendBack: () => void;
  readonly onDismiss: () => void;
  readonly onAccept: () => void;
  readonly onCollapse: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Bot className="size-3.5 text-primary" aria-hidden="true" />
        Proposed rewrite
      </span>
      <span className="flex items-center gap-2 text-xs tabular-nums">
        {added > 0 ? <span className="text-success-foreground">+{added}</span> : null}
        {removed > 0 ? <span className="text-destructive">−{removed}</span> : null}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <Button
          size="xs"
          variant="ghost"
          disabled={commentCount === 0}
          title={
            commentCount === 0
              ? "Select text in the proposal below to leave a note, then send it back."
              : "Return this draft with your notes"
          }
          onClick={onSendBack}
        >
          <MessageSquare className="size-3.5" />
          {commentCount > 0 ? `Send ${commentCount} back` : "Comment"}
        </Button>
        <Button size="xs" variant="ghost" onClick={onDismiss}>
          <X className="size-3.5" />
          Dismiss
        </Button>
        <Button
          size="xs"
          disabled={acceptDisabled}
          {...(acceptReason ? { title: acceptReason } : {})}
          onClick={onAccept}
        >
          <Check className="size-3.5" />
          Accept
        </Button>
        {/* The draft shows itself; collapsing is the reader's choice, not the price of admission. */}
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Collapse proposed rewrite"
          title="Collapse proposed rewrite"
          onClick={onCollapse}
        >
          <ChevronUp className="size-3.5" />
        </Button>
      </span>
    </div>
  );
}
