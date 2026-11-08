import { useState } from "react";

import { Button } from "~/components/ui/button";
import type { HoldKind } from "~/t3team/changeset/t3team-changeSetOutcomeStore";

/** What the reviewer can do about an operation whose write may or may not have landed. */
export function WorkItemChangeSetOperationActions({
  hold,
  disabled,
  onRetryAnyway,
  onMarkApplied,
  onDismiss,
}: {
  readonly hold: HoldKind;
  readonly disabled: boolean;
  readonly onRetryAnyway: () => void;
  readonly onMarkApplied: () => void;
  readonly onDismiss: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (hold === "unrecorded") {
    return (
      <div className="flex gap-1.5 pb-2 pl-18">
        <Button size="xs" variant="outline" disabled={disabled} onClick={onMarkApplied}>
          Retry recording
        </Button>
      </div>
    );
  }
  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 pb-2 pl-18">
        <span className="text-2xs text-muted-foreground">
          Mark as applied in Jira? This records it without writing.
        </span>
        <Button size="xs" variant="outline" disabled={disabled} onClick={onMarkApplied}>
          Confirm
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5 pb-2 pl-18">
      <Button size="xs" variant="outline" disabled={disabled} onClick={onRetryAnyway}>
        Retry anyway
      </Button>
      <Button size="xs" variant="outline" disabled={disabled} onClick={() => setConfirming(true)}>
        Already applied
      </Button>
      <Button size="xs" variant="ghost" disabled={disabled} onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
