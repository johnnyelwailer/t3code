import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import {
  RefusedOperationError,
  UnsupportedOperationError,
} from "~/t3team/changeset/t3team-changeSetApply";
import { normalizeIssueKey } from "~/t3team/changeset/t3team-changeSetModel";
import { APPLY_FROM_ITEM, operationPolicy } from "~/t3team/changeset/t3team-changeSetPolicy";
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
  writeWorkItemEstimatePoints,
  writeWorkItemLink,
  writeWorkItemStatus,
  writeWorkItemSubtask,
} from "~/t3team/workitem/t3team-workItemFieldWrites";

/**
 * The change-set accept: the work item view's own field writes, driven from the member draft's payload.
 * It refuses another provider or project, and anything the card cannot write safely (policy).
 */
export function createChangeSetAcceptOp(input: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  /** The Jira project id `createSubtask` needs: the backlog's `externalProjectId`, not the app's id. */
  readonly externalProjectId?: string | undefined;
  readonly projectKey?: string | undefined;
}): (draft: T3TeamDraftMutationPayload) => Promise<void> {
  return async (payload) => {
    const issueKey = payload.target.issueIdOrKey;
    if (payload.target.provider !== "jira") {
      throw new RefusedOperationError(`${issueKey} is not a Jira work item.`);
    }
    if (!input.projectKey) {
      throw new RefusedOperationError("The project key is unknown. Apply from the work item view.");
    }
    if (!normalizeIssueKey(issueKey).startsWith(`${normalizeIssueKey(input.projectKey)}-`)) {
      throw new RefusedOperationError(`${issueKey} is outside project ${input.projectKey}.`);
    }
    const policy = operationPolicy(payload);
    const draft = normalizeT3TeamDraftMutation({ raw: payload });
    if (!policy.applicable || !draft) {
      throw new UnsupportedOperationError(policy.reason ?? APPLY_FROM_ITEM);
    }
    const ctx = { backend: input.backend, accountId: input.accountId, issueIdOrKey: issueKey };
    if ("proposedContent" in draft) {
      return writeWorkItemComment(ctx, draft.proposedContent.body);
    }
    switch (draft.field) {
      case "status":
        return writeWorkItemStatus(ctx, readStatusDraftPatch(draft)!);
      case "assignee":
        return writeWorkItemAssignee(ctx, readAssigneeDraftPatch(draft)!);
      case "estimate":
        return writeWorkItemEstimatePoints(ctx, readEstimatePointsDraftPatch(draft)!);
      case "link":
        return writeWorkItemLink(ctx, readLinkDraftPatch(draft)!);
      case "subtask":
        if (!input.externalProjectId) throw new UnsupportedOperationError(APPLY_FROM_ITEM);
        return writeWorkItemSubtask(ctx, input.externalProjectId, readSubtaskDraftPatch(draft)!);
    }
  };
}
