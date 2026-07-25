import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { WorkItemAssigneeControl } from "~/t3team/workitem/t3team-WorkItemAssigneeControl";
import { WorkItemEstimateControl } from "~/t3team/workitem/t3team-WorkItemEstimateControl";
import { WorkItemStatusControl } from "~/t3team/workitem/t3team-WorkItemStatusControl";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";

/**
 * Builds the Slice B editable controls for the title band and properties rail, or `undefined` for
 * each when there is no live backend/account to write through — the view then stays exactly as
 * read-only as it was before this slice.
 *
 * A plain function rather than a hook: nothing here holds state, it only decides which element (or
 * none) to hand to a slot.
 */
export function buildWorkItemDetailMainControls({
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
        onReload={onReload}
      />
    ) : undefined,
    assigneeControl: (
      <WorkItemAssigneeControl
        backend={backend}
        accountId={accountId}
        issueIdOrKey={model.key}
        assignee={model.assignee}
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
        onReload={onReload}
      />
    ),
  };
}
