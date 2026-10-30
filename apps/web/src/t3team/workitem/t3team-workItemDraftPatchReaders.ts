import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import { readString, type WorkItemPerson } from "~/t3team/workitem/t3team-workItemFieldReaders";

/**
 * Reads what `t3team-toolBrokerDraftMutations.ts` actually puts in a scalar draft's `patch` for each
 * field this slice renders a review affordance for. Kept separate from the control components so the
 * "does this patch shape apply to the control I have" question is unit-testable on its own.
 */

/** `targetStatus` from a status draft's patch, or `undefined` if the patch doesn't carry one. */
export function readStatusDraftPatch(draft: T3TeamScalarDraftMutation): string | undefined {
  return readString(draft.patch.targetStatus);
}

/** Assignee drafts always carry `assigneeAccountId` (string, or null to unassign). */
export function readAssigneeDraftPatch(
  draft: T3TeamScalarDraftMutation,
): WorkItemPerson | null | undefined {
  const { patch } = draft;
  if (!("assigneeAccountId" in patch)) return undefined;
  const accountId = patch.assigneeAccountId;
  if (accountId === null) return null;
  if (typeof accountId !== "string" || accountId.length === 0) return undefined;
  return { displayName: readString(patch.assigneeDisplayName) ?? accountId, accountId };
}

/**
 * Only an explicit "points" draft has a live control to accept into: `WorkItemEstimateControl` always
 * writes story points, so "hours" or an unstated mode reads as `undefined` rather than a guess.
 */
export function readEstimatePointsDraftPatch(
  draft: T3TeamScalarDraftMutation,
): number | null | undefined {
  const { patch } = draft;
  if (patch.estimateMode !== "points") return undefined;
  if (patch.estimateValue === null) return null;
  return typeof patch.estimateValue === "number" && Number.isFinite(patch.estimateValue)
    ? patch.estimateValue
    : undefined;
}

export type WorkItemLinkDraftPatch =
  | {
      readonly action: "create";
      readonly otherIssueIdOrKey: string;
      readonly linkTypeName: string;
      readonly direction: "inward" | "outward";
    }
  | { readonly action: "remove"; readonly linkId: string };

/** Matches `t3team-toolBrokerDraftMutationsLinks.ts`'s two patch shapes (create vs. remove). */
export function readLinkDraftPatch(
  draft: T3TeamScalarDraftMutation,
): WorkItemLinkDraftPatch | undefined {
  const { patch } = draft;
  if (patch.action === "remove") {
    const linkId = readString(patch.linkId);
    return linkId ? { action: "remove", linkId } : undefined;
  }
  const otherIssueIdOrKey = readString(patch.otherIssueIdOrKey);
  const linkTypeName = readString(patch.linkTypeName);
  const direction =
    patch.direction === "inward" || patch.direction === "outward" ? patch.direction : undefined;
  return otherIssueIdOrKey && linkTypeName && direction
    ? { action: "create", otherIssueIdOrKey, linkTypeName, direction }
    : undefined;
}

export type WorkItemSubtaskDraftPatch = {
  readonly summary: string;
  readonly description?: string;
  readonly estimateHours?: number;
};

export function readSubtaskDraftPatch(
  draft: T3TeamScalarDraftMutation,
): WorkItemSubtaskDraftPatch | undefined {
  const { patch } = draft;
  const summary = readString(patch.summary);
  if (!summary) return undefined;
  const description = readString(patch.description);
  const estimateHours =
    typeof patch.estimateHours === "number" && Number.isFinite(patch.estimateHours)
      ? patch.estimateHours
      : undefined;
  return {
    summary,
    ...(description ? { description } : {}),
    ...(estimateHours !== undefined ? { estimateHours } : {}),
  };
}

export type WorkItemAddRemoveDraftPatch = {
  readonly add: ReadonlyArray<string>;
  readonly remove: ReadonlyArray<string>;
};

/** Labels and fix-version drafts share `{ add, remove }`; an all-empty or malformed patch is unreadable. */
export function readAddRemoveDraftPatch(
  draft: T3TeamScalarDraftMutation,
): WorkItemAddRemoveDraftPatch | undefined {
  const names = (value: unknown): ReadonlyArray<string> | undefined =>
    Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim() !== "")
      ? value
      : undefined;
  const add = names(draft.patch.add);
  const remove = names(draft.patch.remove);
  return add && remove && add.length + remove.length > 0 ? { add, remove } : undefined;
}

export function readPriorityDraftPatch(draft: T3TeamScalarDraftMutation): string | undefined {
  return readString(draft.patch.priority);
}
