import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";

import { normalizeT3TeamDraftMutation } from "~/t3team/t3team-draftMutationModel";
import {
  readAssigneeDraftPatch,
  readEstimatePointsDraftPatch,
  readLinkDraftPatch,
  readStatusDraftPatch,
  readSubtaskDraftPatch,
} from "~/t3team/workitem/t3team-workItemDraftPatchReaders";

export const APPLY_FROM_ITEM = "Apply this one from the work item view.";
export const REVIEW_IN_ITEM = "Review and apply from the work item view.";
const NEW_ITEM_HINT = "Creates a new item; check Jira first if a previous apply was interrupted.";

export type OperationPolicy = {
  /** False when the card has no safe way to write it: it only shows it, and can dismiss it. */
  readonly applicable: boolean;
  /** Pre-ticked. A write that creates something is not: the reader ticks it on purpose. */
  readonly defaultApproved: boolean;
  /** A write whose reply was lost can be sent again without a second effect. */
  readonly repeatable: boolean;
  readonly reason?: string;
  /** One line shown on an applicable operation that creates a new item. */
  readonly hint?: string;
};

const notApplicable = (reason: string): OperationPolicy => ({
  applicable: false,
  defaultApproved: false,
  repeatable: true,
  reason,
});

const scalar = (applicable: boolean, repeatable: boolean): OperationPolicy =>
  !applicable
    ? notApplicable(APPLY_FROM_ITEM)
    : repeatable
      ? { applicable, defaultApproved: true, repeatable }
      : { applicable, defaultApproved: false, repeatable, hint: NEW_ITEM_HINT };

/** What the card may do with one member draft, read from its own patch. */
export function operationPolicy(payload: T3TeamDraftMutationPayload | undefined): OperationPolicy {
  const draft = payload ? normalizeT3TeamDraftMutation({ raw: payload }) : null;
  if (!draft) return notApplicable(APPLY_FROM_ITEM);
  switch (draft.field) {
    case "description":
      return notApplicable(REVIEW_IN_ITEM);
    case "comment":
      return { applicable: true, defaultApproved: false, repeatable: false, hint: NEW_ITEM_HINT };
    case "status":
      return scalar(readStatusDraftPatch(draft) !== undefined, true);
    case "assignee":
      return scalar(readAssigneeDraftPatch(draft) !== undefined, true);
    case "estimate":
      return scalar(readEstimatePointsDraftPatch(draft) !== undefined, true);
    case "link": {
      const link = readLinkDraftPatch(draft);
      return scalar(link !== undefined, link?.action === "remove");
    }
    case "subtask":
      return scalar(readSubtaskDraftPatch(draft) !== undefined, false);
  }
}
