import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type {
  WorkItemAddRemoveDraftPatch,
  WorkItemLinkDraftPatch,
  WorkItemSubtaskDraftPatch,
} from "~/t3team/workitem/t3team-workItemDraftPatchReaders";
import type { WorkItemPerson } from "~/t3team/workitem/t3team-workItemFieldReaders";

/**
 * The one definition of each work-item field write. The detail view's mutation hooks and the
 * change-set apply both call these, so a field is written the same way whichever surface accepts it.
 */
export type WorkItemWriteContext = {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly issueIdOrKey: string;
};

export async function writeWorkItemStatus(
  { backend, accountId, issueIdOrKey }: WorkItemWriteContext,
  targetStatus: string,
): Promise<void> {
  await backend.updateIssueStatus({ accountId, issueIdOrKey, targetStatus });
}

export function writeWorkItemAssignee(
  { backend, accountId, issueIdOrKey }: WorkItemWriteContext,
  person: WorkItemPerson | null,
): Promise<void> {
  return backend.updateIssueAssignee({
    accountId,
    issueIdOrKey,
    assigneeAccountId: person?.accountId ?? null,
    assigneeDisplayName: person?.displayName ?? null,
  });
}

/** Story points only: `WorkItemEstimateControl` never writes the hour-tracked original estimate. */
export async function writeWorkItemEstimatePoints(
  { backend, accountId, issueIdOrKey }: WorkItemWriteContext,
  estimateValue: number | null,
): Promise<void> {
  await backend.updateIssueEstimate({
    accountId,
    issueIdOrKey,
    estimateValue,
    estimateMode: "points",
  });
}

export async function writeWorkItemLink(
  { backend, accountId, issueIdOrKey }: WorkItemWriteContext,
  link: WorkItemLinkDraftPatch,
): Promise<void> {
  if (link.action === "remove") {
    await backend.deleteIssueLink({ accountId, linkId: link.linkId });
    return;
  }
  const { otherIssueIdOrKey, linkTypeName, direction } = link;
  await backend.createIssueLink({
    accountId,
    issueIdOrKey,
    otherIssueIdOrKey,
    linkTypeName,
    direction,
  });
}

export async function writeWorkItemSubtask(
  { backend, accountId, issueIdOrKey }: WorkItemWriteContext,
  projectId: string,
  subtask: WorkItemSubtaskDraftPatch,
): Promise<void> {
  await backend.createSubtask({
    accountId,
    projectId,
    parentIssueIdOrKey: issueIdOrKey,
    ...subtask,
  });
}

export async function writeWorkItemComment(
  { backend, accountId, issueIdOrKey }: WorkItemWriteContext,
  body: string,
): Promise<void> {
  await backend.addIssueComment({ accountId, issueIdOrKey, body });
}

export async function writeWorkItemLabels(
  { backend, accountId, issueIdOrKey }: WorkItemWriteContext,
  labels: WorkItemAddRemoveDraftPatch,
): Promise<void> {
  await backend.updateIssueFields({ accountId, issueIdOrKey, labels });
}

export async function writeWorkItemPriority(
  { backend, accountId, issueIdOrKey }: WorkItemWriteContext,
  priority: string,
): Promise<void> {
  await backend.updateIssueFields({ accountId, issueIdOrKey, priority });
}

export async function writeWorkItemFixVersions(
  { backend, accountId, issueIdOrKey }: WorkItemWriteContext,
  fixVersions: WorkItemAddRemoveDraftPatch,
): Promise<void> {
  await backend.updateIssueFields({ accountId, issueIdOrKey, fixVersions });
}
