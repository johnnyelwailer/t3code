import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import { useWorkItemDraftActionAccept } from "~/t3team/workitem/t3team-useWorkItemDraftActionAccept";
import { useWorkItemFieldDraftAccept } from "~/t3team/workitem/t3team-useWorkItemFieldDraftAccept";
import type { WorkItemFieldMutations } from "~/t3team/workitem/t3team-useWorkItemFieldMutations";
import {
  readAssigneeDraftPatch,
  readEstimatePointsDraftPatch,
  readAddRemoveDraftPatch,
  type WorkItemAddRemoveDraftPatch,
  readLinkDraftPatch,
  readPriorityDraftPatch,
  readStatusDraftPatch,
  readSubtaskDraftPatch,
} from "~/t3team/workitem/t3team-workItemDraftPatchReaders";
import {
  writeWorkItemFixVersions,
  writeWorkItemLabels,
  writeWorkItemLink,
  writeWorkItemPriority,
  writeWorkItemSubtask,
  type WorkItemWriteContext,
} from "~/t3team/workitem/t3team-workItemFieldWrites";

const writePriority = (ctx: WorkItemWriteContext, priority: string | undefined) =>
  priority === undefined ? undefined : () => writeWorkItemPriority(ctx, priority);

const writeAddRemove = (
  ctx: WorkItemWriteContext,
  field: "labels" | "fix_version",
  change: WorkItemAddRemoveDraftPatch | undefined,
) =>
  change === undefined
    ? undefined
    : () =>
        field === "labels"
          ? writeWorkItemLabels(ctx, change)
          : writeWorkItemFixVersions(ctx, change);

/**
 * Builds one "resolve this scalar draft" dispatcher for the strip, covering every field kind this
 * view currently has a real write path for. Status/assignee/estimate accept through `mutations` —
 * the exact same `useWorkItemFieldMutation` instances the direct-edit chips commit through (built
 * once in `useWorkItemFieldMutations`, shared rather than duplicated), so accepting from the strip
 * is indistinguishable from a direct edit: same optimistic apply, rollback, and undo banner in the
 * same place. Link/subtask are create/remove actions with no "current value" to swap, so they use
 * the simpler `applying → applied/error` action accept instead.
 *
 * A field kind this hook doesn't recognize (added later, before this view grows a resolver for it)
 * returns `undefined` — the row still renders, just without an Accept button.
 */
export function useWorkItemDraftStripScalarAccept(input: {
  readonly issueIdOrKey: string;
  readonly projectId: string;
  readonly mutations: WorkItemFieldMutations;
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  readonly onReload: () => void;
}): (draft: T3TeamScalarDraftMutation) => (() => void) | undefined {
  const { issueIdOrKey, projectId, mutations, backend, accountId, onReload } = input;

  const acceptStatus = useWorkItemFieldDraftAccept(mutations.status);
  const acceptAssignee = useWorkItemFieldDraftAccept(mutations.assignee);
  const acceptEstimate = useWorkItemFieldDraftAccept(mutations.estimate);
  const acceptAction = useWorkItemDraftActionAccept();

  return (draft) => {
    if (draft.field === "status") {
      const to = readStatusDraftPatch(draft);
      return to !== undefined ? () => acceptStatus(draft, to) : undefined;
    }
    if (draft.field === "assignee") {
      const to = readAssigneeDraftPatch(draft);
      return to !== undefined ? () => acceptAssignee(draft, to) : undefined;
    }
    if (draft.field === "estimate") {
      const to = readEstimatePointsDraftPatch(draft);
      return to !== undefined ? () => acceptEstimate(draft, to) : undefined;
    }
    if (draft.field === "link" && backend && accountId) {
      const link = readLinkDraftPatch(draft);
      if (!link) return undefined;
      return () =>
        acceptAction(draft, async () => {
          await writeWorkItemLink({ backend, accountId, issueIdOrKey }, link);
          onReload();
        });
    }
    if (
      (draft.field === "labels" || draft.field === "priority" || draft.field === "fix_version") &&
      backend &&
      accountId
    ) {
      const ctx = { backend, accountId, issueIdOrKey };
      const write =
        draft.field === "priority"
          ? writePriority(ctx, readPriorityDraftPatch(draft))
          : writeAddRemove(ctx, draft.field, readAddRemoveDraftPatch(draft));
      if (!write) return undefined;
      return () =>
        acceptAction(draft, async () => {
          await write();
          onReload();
        });
    }
    if (draft.field === "subtask" && backend && accountId) {
      const subtask = readSubtaskDraftPatch(draft);
      if (!subtask) return undefined;
      return () =>
        acceptAction(draft, async () => {
          await writeWorkItemSubtask({ backend, accountId, issueIdOrKey }, projectId, subtask);
          onReload();
        });
    }
    return undefined;
  };
}
