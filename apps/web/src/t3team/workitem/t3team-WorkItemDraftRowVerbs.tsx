import { Check, MessageSquare, X } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";

/**
 * What a human can do to one proposed change — matches `t3team-WorkItemDraftRowVerbs.stories.tsx`.
 *
 * Accept-or-dismiss is too coarse: most proposals are directionally right and wrong in a detail, and
 * forcing those into "reject" throws away work and teaches the agent nothing. Correcting the value by
 * hand is the wrong repair — it would mean embedding each field's real control in a table row, and
 * eventually an ADF editor in a table row. So the third verb is a comment, which routes back to the
 * thread that proposed it.
 */
export function WorkItemDraftRowVerbs({
  fieldLabel,
  proposedLabel,
  accept,
  onComment,
  onDismiss,
  pending,
}: {
  readonly fieldLabel: string;
  readonly proposedLabel: string;
  /** Omitted when this field kind has no accept path wired in this view yet. */
  readonly accept?: (() => void) | undefined;
  readonly onComment: () => void;
  readonly onDismiss: () => void;
  readonly pending: boolean;
}) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {accept ? (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Accept proposed ${fieldLabel}: ${proposedLabel}`}
          disabled={pending}
          onClick={accept}
        >
          <Check className="size-3.5 text-success" />
        </Button>
      ) : null}
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`Comment on proposed ${fieldLabel}: ${proposedLabel}`}
        disabled={pending}
        onClick={onComment}
      >
        <MessageSquare className="size-3.5" />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`Dismiss proposed ${fieldLabel}: ${proposedLabel}`}
        disabled={pending}
        onClick={onDismiss}
      >
        <X className="size-3.5 text-muted-foreground" />
      </Button>
    </span>
  );
}
