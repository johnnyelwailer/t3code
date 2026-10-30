import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import {
  readAddRemoveDraftPatch,
  readPriorityDraftPatch,
} from "~/t3team/workitem/t3team-workItemDraftPatchReaders";

/** "+bug, -wontfix": the value of a labels or fix-version draft. */
function addRemoveText(draft: T3TeamScalarDraftMutation): string | undefined {
  const change = readAddRemoveDraftPatch(draft);
  return (
    change && [...change.add.map((n) => `+${n}`), ...change.remove.map((n) => `-${n}`)].join(", ")
  );
}

/** The proposed value of a labels / priority / fix-version draft; `undefined` for any other kind. */
export function fieldDraftValueText(draft: T3TeamScalarDraftMutation): string | undefined {
  if (draft.field === "labels" || draft.field === "fix_version") return addRemoveText(draft);
  return draft.field === "priority" ? readPriorityDraftPatch(draft) : undefined;
}

/** One-line card summary: "+bug, -wontfix", "Priority: High", "Fix version: +2.4.0". */
export function fieldDraftSummary(draft: T3TeamScalarDraftMutation): string | undefined {
  const value = fieldDraftValueText(draft);
  if (value === undefined) return undefined;
  if (draft.field === "priority") return `Priority: ${value}`;
  return draft.field === "fix_version" ? `Fix version: ${value}` : value;
}
