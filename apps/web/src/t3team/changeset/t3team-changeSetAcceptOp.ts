import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { UnsupportedOperationError } from "~/t3team/changeset/t3team-changeSetApply";
import { normalizeT3TeamDraftMutation } from "~/t3team/t3team-draftMutationModel";
import {
  readAssigneeDraftPatch,
  readEstimatePointsDraftPatch,
  readLinkDraftPatch,
  readStatusDraftPatch,
  readSubtaskDraftPatch,
} from "~/t3team/workitem/t3team-workItemDraftPatchReaders";
import {
  writeWorkItemAssignee,
  writeWorkItemComment,
  writeWorkItemDescription,
  writeWorkItemEstimatePoints,
  writeWorkItemLink,
  writeWorkItemStatus,
  writeWorkItemSubtask,
} from "~/t3team/workitem/t3team-workItemFieldWrites";

const APPLY_FROM_ITEM = "Apply this one from the work item view.";

/**
 * The change-set accept: the same field writes the work item view's Accept uses, driven headless
 * from the member draft's own payload. A patch no write path reads throws instead of guessing.
 */
export function createChangeSetAcceptOp(input: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  /** Jira project the strip creates subtasks in: the same id `useWorkItemDraftStripScalarAccept` gets. */
  readonly projectId: string;
}): (draft: T3TeamDraftMutationPayload) => Promise<void> {
  return async (payload) => {
    const draft = normalizeT3TeamDraftMutation({ raw: payload });
    if (!draft) throw new UnsupportedOperationError(APPLY_FROM_ITEM);
    const ctx = {
      backend: input.backend,
      accountId: input.accountId,
      issueIdOrKey: draft.target.issueIdOrKey,
    };
    if ("proposedContent" in draft) {
      const body = draft.proposedContent.body;
      return draft.field === "description"
        ? writeWorkItemDescription(ctx, body)
        : writeWorkItemComment(ctx, body);
    }
    switch (draft.field) {
      case "status": {
        const to = readStatusDraftPatch(draft);
        if (to !== undefined) return writeWorkItemStatus(ctx, to);
        break;
      }
      case "assignee": {
        const to = readAssigneeDraftPatch(draft);
        if (to !== undefined) return writeWorkItemAssignee(ctx, to);
        break;
      }
      case "estimate": {
        const to = readEstimatePointsDraftPatch(draft);
        if (to !== undefined) return writeWorkItemEstimatePoints(ctx, to);
        break;
      }
      case "link": {
        const link = readLinkDraftPatch(draft);
        if (link) return writeWorkItemLink(ctx, link);
        break;
      }
      case "subtask": {
        const subtask = readSubtaskDraftPatch(draft);
        if (subtask) return writeWorkItemSubtask(ctx, input.projectId, subtask);
        break;
      }
    }
    throw new UnsupportedOperationError(APPLY_FROM_ITEM);
  };
}
