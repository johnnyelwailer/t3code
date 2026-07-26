import { cn } from "~/t3team/lib/t3team-utils";

/**
 * Sits inline next to a field's current value, fixed size so it never changes the row's height — the
 * meta row's text runs share a top edge that a taller draft affordance would break. Dashed rather
 * than solid, so "this is provisional" reads from shape and not only from the accent colour.
 *
 * `aria-hidden`: the accessible name for "something is proposed here" lives on the Accept/Dismiss
 * actions below (`role="status"`, in `WorkItemFieldOverlay`'s out-of-flow slot), so this dot is a
 * visual echo rather than a second, redundant announcement.
 */
export function WorkItemFieldDraftMarker({
  label,
  className,
}: {
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      title={label}
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full border-2 border-dashed border-primary align-middle",
        className,
      )}
    />
  );
}

/**
 * The proposed value plus Accept/Dismiss, rendered inside a `WorkItemFieldOverlay` so it never
 * pushes layout. `role="status"` announces it on appearance without a colour being the only signal.
 */
export function WorkItemFieldDraftActions({
  fieldLabel,
  proposedLabel,
  pending,
  onAccept,
  onDismiss,
}: {
  /** e.g. "status", "assignee" — used only to build the Accept/Dismiss labels below. */
  readonly fieldLabel: string;
  readonly proposedLabel: string;
  readonly pending: boolean;
  readonly onAccept: () => void;
  readonly onDismiss: () => void;
}) {
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs">
      <span className="truncate text-muted-foreground">
        Proposed <span className="font-medium text-primary">{proposedLabel}</span>
      </span>
      <button
        type="button"
        aria-label={`Accept proposed ${fieldLabel}: ${proposedLabel}`}
        disabled={pending}
        onClick={onAccept}
        className="shrink-0 font-medium text-primary hover:underline disabled:opacity-60"
      >
        Accept
      </button>
      <button
        type="button"
        aria-label={`Dismiss proposed ${fieldLabel}: ${proposedLabel}`}
        disabled={pending}
        onClick={onDismiss}
        className="shrink-0 text-muted-foreground hover:underline disabled:opacity-60"
      >
        Dismiss
      </button>
    </span>
  );
}
