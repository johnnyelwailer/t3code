import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { pickScalarDraft, useWorkItemDrafts } from "~/t3team/workitem/t3team-useWorkItemDrafts";
import { WorkItemAssigneeControl } from "~/t3team/workitem/t3team-WorkItemAssigneeControl";
import { WorkItemEstimateControl } from "~/t3team/workitem/t3team-WorkItemEstimateControl";
import { WorkItemStatusControl } from "~/t3team/workitem/t3team-WorkItemStatusControl";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";

/**
 * Builds the Slice B editable controls for the title band and properties rail, or `undefined` for
 * each when there is no live backend/account to write through — the view then stays exactly as
 * read-only as it was before this slice.
 *
 * A hook, not a plain function, because it now also indexes this issue's pending scalar drafts
 * (`useWorkItemDrafts`) so a status/assignee/estimate draft flows straight into the matching
 * control — the "review affordance where the change would land" rule from the redesign doc. The
 * index is read unconditionally, before the early return below, since hooks can't be conditional.
 */
export function useWorkItemDetailMainControls({
  model,
  accountId,
  backend,
  externalProjectId,
  currentUserName,
  onReload,
}: {
  readonly model: WorkItemFieldModel;
  readonly accountId?: string | undefined;
  readonly backend?: AtlassianBackendApi | undefined;
  readonly externalProjectId?: string | undefined;
  readonly currentUserName?: string | undefined;
  readonly onReload: () => void;
}) {
  const draftsByField = useWorkItemDrafts({ issueIdOrKey: model.key });

  if (!backend || !accountId) {
    return { statusControl: undefined, assigneeControl: undefined, estimateControl: undefined };
  }

  return {
    statusControl: externalProjectId ? (
      <WorkItemStatusControl
        backend={backend}
        accountId={accountId}
        externalProjectId={externalProjectId}
        issueIdOrKey={model.key}
        status={model.status}
        draft={pickScalarDraft(draftsByField, "status")}
        onReload={onReload}
      />
    ) : undefined,
    assigneeControl: (
      <WorkItemAssigneeControl
        backend={backend}
        accountId={accountId}
        issueIdOrKey={model.key}
        assignee={model.assignee}
        draft={pickScalarDraft(draftsByField, "assignee")}
        {...(currentUserName ? { currentUserName } : {})}
        onReload={onReload}
      />
    ),
    estimateControl: (
      <WorkItemEstimateControl
        backend={backend}
        accountId={accountId}
        issueIdOrKey={model.key}
        storyPoints={model.storyPoints}
        agentDraft={pickScalarDraft(draftsByField, "estimate")}
        onReload={onReload}
      />
    ),
  };
}
