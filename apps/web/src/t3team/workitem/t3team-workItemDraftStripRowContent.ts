import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import {
  readAssigneeDraftPatch,
  readEstimatePointsDraftPatch,
  readStatusDraftPatch,
} from "~/t3team/workitem/t3team-workItemDraftPatchReaders";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";

/**
 * Turns one scalar draft into the strip row's "from → to" line, for the fields this view has a
 * current value for (status/assignee/estimate). A field the strip doesn't know how to diff this way
 * (link, subtask, or anything added later) reads `undefined` — the row falls back to `draft.summary`
 * rather than a switch statement growing every time a new field kind lands.
 */
export function scalarDraftChangeLine(
  draft: T3TeamScalarDraftMutation,
  model: WorkItemFieldModel,
): { readonly from: string; readonly to: string } | undefined {
  if (draft.field === "status") {
    const to = readStatusDraftPatch(draft);
    return to !== undefined ? { from: model.status?.name ?? "No status", to } : undefined;
  }

  if (draft.field === "assignee") {
    const proposed = readAssigneeDraftPatch(draft);
    if (proposed === undefined) return undefined;
    return {
      from: model.assignee?.displayName ?? "Unassigned",
      to: proposed?.displayName ?? "Unassigned",
    };
  }

  if (draft.field === "estimate") {
    const proposed = readEstimatePointsDraftPatch(draft);
    if (proposed === undefined) return undefined;
    return { from: model.storyPoints !== undefined ? String(model.storyPoints) : "—", to: String(proposed ?? "—") };
  }

  return undefined;
}

const FIELD_LABELS: Partial<Record<T3TeamScalarDraftMutation["field"], string>> = {
  status: "Status",
  assignee: "Assignee",
  estimate: "Points",
  link: "Link",
  subtask: "Subtask",
};

/** Falls back to the raw field name, capitalized, for a field kind this view doesn't label yet. */
export function scalarFieldLabel(field: T3TeamScalarDraftMutation["field"]): string {
  return FIELD_LABELS[field] ?? field.charAt(0).toUpperCase() + field.slice(1);
}

export function documentFieldLabel(field: "description" | "comment"): string {
  return field === "description" ? "Description" : "Comment";
}

/*
  There is deliberately no `formatDraftDiffMagnitude` here. Joining `+12` and `−3` into one string
  is what cost the counts their colours — a single string can only carry one text class, so the
  document row was the one place in the review where a magnitude rendered monochrome. The row now
  takes `added`/`removed` as numbers and renders each in its own span.
*/
