import { Button } from "~/components/ui/button";
import type { OperationOutcome } from "~/t3team/changeset/t3team-changeSetApply";

/** What the reviewer can do about an operation whose write may or may not have landed. */
export function WorkItemChangeSetOperationActions({
  status,
  disabled,
  onRetryAnyway,
  onMarkApplied,
  onDismiss,
}: {
  readonly status: OperationOutcome["status"];
  readonly disabled: boolean;
  readonly onRetryAnyway: () => void;
  readonly onMarkApplied: () => void;
  readonly onDismiss: () => void;
}) {
  if (status === "unrecorded") {
    return (
      <div className="flex gap-1.5 pb-2 pl-18">
        <Button size="xs" variant="outline" disabled={disabled} onClick={onMarkApplied}>
          Retry recording
        </Button>
      </div>
    );
  }
  if (status !== "uncertain") return null;
  return (
    <div className="flex flex-wrap gap-1.5 pb-2 pl-18">
      <Button size="xs" variant="outline" disabled={disabled} onClick={onRetryAnyway}>
        Retry anyway
      </Button>
      <Button size="xs" variant="outline" disabled={disabled} onClick={onMarkApplied}>
        Already applied
      </Button>
      <Button size="xs" variant="ghost" disabled={disabled} onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
