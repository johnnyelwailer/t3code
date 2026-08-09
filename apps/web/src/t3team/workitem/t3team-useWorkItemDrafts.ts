import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  selectWorkItemDrafts,
  useT3TeamDraftMutationStore,
} from "~/t3team/t3team-draftMutationStore";
import {
  isT3TeamDocumentDraftMutation,
  type T3TeamDraftMutation,
  type T3TeamDraftMutationField,
  type T3TeamScalarDraftMutation,
} from "~/t3team/t3team-draftMutationTypes";

/**
 * One pending draft per field. A `Partial<Record<...>>` over the whole `T3TeamDraftMutationField`
 * union rather than a fixed shape — a field kind added to that union later (links, child creation,
 * ...) is indexed the same way, so nothing here needs to change when the union grows.
 */
export type WorkItemDraftsByField = Partial<Record<T3TeamDraftMutationField, T3TeamDraftMutation>>;

/**
 * Pending (non-terminal) drafts for one issue, indexed by `field`.
 *
 * Reuses the same store-reading path `TicketDetailDraftDocumentReview` established for document
 * drafts (`useShallow` over a store selector) rather than a second access path onto the drafts
 * array.
 *
 * The store already sorts by `createdAt` descending (`mergeDrafts`), so keeping only the first draft
 * seen per field keeps the most recent one whenever more than one targets the same field.
 */
export function useWorkItemDrafts(input: {
  readonly projectId?: string;
  readonly issueIdOrKey: string;
}): WorkItemDraftsByField {
  const drafts = useT3TeamDraftMutationStore(useShallow(selectWorkItemDrafts(input)));

  return useMemo(() => {
    const byField: WorkItemDraftsByField = {};
    for (const draft of drafts) {
      if (!byField[draft.field]) byField[draft.field] = draft;
    }
    return byField;
  }, [drafts]);
}

/**
 * Narrows a field's indexed draft to `T3TeamScalarDraftMutation` for the controls that only ever
 * handle scalar fields (status/assignee/estimate/subtask) — a real type-guard check, not a cast, so
 * a document draft landing on an unexpected key can't slip through.
 */
export function pickScalarDraft(
  byField: WorkItemDraftsByField,
  field: T3TeamScalarDraftMutation["field"],
): T3TeamScalarDraftMutation | undefined {
  const draft = byField[field];
  return draft && !isT3TeamDocumentDraftMutation(draft) ? draft : undefined;
}

/** Pending drafts for fields that have no other review surface (document drafts have their own). */
export function countWorkItemScalarDrafts(byField: WorkItemDraftsByField): number {
  return Object.values(byField).filter(
    (draft): draft is T3TeamScalarDraftMutation =>
      draft !== undefined && !isT3TeamDocumentDraftMutation(draft),
  ).length;
}

/** All pending drafts, scalar and document — what the nav pill counts now the strip resolves both. */
export function countWorkItemDraftsPending(byField: WorkItemDraftsByField): number {
  return Object.keys(byField).length;
}
