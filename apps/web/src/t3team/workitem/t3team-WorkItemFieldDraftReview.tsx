import type { ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import { useWorkItemDraftReviewUiStore } from "~/t3team/workitem/t3team-workItemDraftReviewUiStore";

/**
 * Sits inline next to a field's current value, fixed size so it never changes the row's height — the
 * meta row's text runs share a top edge that a taller draft affordance would break. Dashed rather
 * than solid, so "this is provisional" reads from shape and not only from the accent colour.
 *
 * A real button, not a decorative dot: clicking it opens the one shared draft strip (docked under the
 * section nav) with this field's row highlighted — never a popover of its own, so two proposed fields
 * can never produce two overlapping panels.
 */
export function WorkItemFieldDraftMarker({
  label,
  onClick,
  className,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-2.5 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-primary align-middle transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    />
  );
}

/**
 * Builds the marker (or `null`) for one field, so the three chip controls that use it don't each
 * repeat the "no draft / unparseable patch → no marker" branch and the `openStrip` wiring.
 */
export function useWorkItemFieldDraftMarker(input: {
  readonly issueIdOrKey: string;
  readonly field: string;
  readonly draft: T3TeamScalarDraftMutation | undefined;
  readonly proposedLabel: string | undefined;
}): ReactNode {
  const openStrip = useWorkItemDraftReviewUiStore((state) => state.openStrip);
  if (!input.draft || input.proposedLabel === undefined) return null;
  return (
    <WorkItemFieldDraftMarker
      label={`Proposed ${input.field}: ${input.proposedLabel}`}
      onClick={() => openStrip(input.issueIdOrKey, input.field)}
    />
  );
}
