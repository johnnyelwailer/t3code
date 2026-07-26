import type { ReactNode } from "react";

import { T3TeamErrorStateInline } from "~/t3team/components/error/t3team-ErrorStateInline";
import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import {
  WorkItemFieldDraftActions,
  WorkItemFieldDraftMarker,
} from "~/t3team/workitem/t3team-WorkItemFieldDraftReview";
import { WorkItemFieldUndoBanner } from "~/t3team/workitem/t3team-WorkItemFieldOverlay";
import { useWorkItemFieldDraftAccept } from "~/t3team/workitem/t3team-useWorkItemFieldDraftAccept";
import type { WorkItemFieldMutationResult } from "~/t3team/workitem/t3team-useWorkItemFieldMutation";

/**
 * One field control's whole draft affordance: the inline marker plus whichever overlay content wins
 * — a fresh error from this same commit path, else the pending draft's Accept/Dismiss, else the undo
 * banner from the last direct edit. Shared by status/assignee/estimate so the priority rule and the
 * accept-through-the-same-mutation wiring exist exactly once instead of three times.
 */
export function useWorkItemFieldDraftOverlay<TValue>({
  mutation,
  draft,
  proposedValue,
  proposedLabel,
  fieldLabel,
  undoLabel,
}: {
  readonly mutation: WorkItemFieldMutationResult<TValue>;
  readonly draft: T3TeamScalarDraftMutation | undefined;
  /** The value Accept should commit. `undefined` (the mutation hook's own "unset" sentinel) means
   *  this draft's patch has nothing this control can act on. */
  readonly proposedValue: TValue | undefined;
  readonly proposedLabel: string | undefined;
  /** e.g. "status" — only used to build the Accept/Dismiss/marker labels. */
  readonly fieldLabel: string;
  /** Pre-formatted by the caller from `mutation.lastChange`, since its shape differs per field. */
  readonly undoLabel: string | undefined;
}): { readonly marker: ReactNode; readonly overlay: ReactNode } {
  const discardDraft = useT3TeamDraftMutationStore((state) => state.discardDraft);
  const acceptDraft = useWorkItemFieldDraftAccept(mutation);

  const actionable =
    draft !== undefined && proposedValue !== undefined && proposedLabel !== undefined
      ? { draft, value: proposedValue, label: proposedLabel }
      : undefined;

  const marker = actionable ? (
    <WorkItemFieldDraftMarker label={`Proposed ${fieldLabel}: ${actionable.label}`} />
  ) : null;

  const overlay = mutation.error ? (
    <T3TeamErrorStateInline userFacing={mutation.error} showRetry={false} />
  ) : actionable ? (
    <WorkItemFieldDraftActions
      fieldLabel={fieldLabel}
      proposedLabel={actionable.label}
      pending={actionable.draft.status === "applying"}
      onAccept={() => acceptDraft(actionable.draft, actionable.value)}
      onDismiss={() => discardDraft(actionable.draft.id)}
    />
  ) : undoLabel ? (
    <WorkItemFieldUndoBanner label={undoLabel} onUndo={mutation.undo} />
  ) : null;

  return { marker, overlay };
}
