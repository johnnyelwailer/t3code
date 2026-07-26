import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { pickScalarDraft, useWorkItemDrafts } from "~/t3team/workitem/t3team-useWorkItemDrafts";
import { useWorkItemFieldMutations } from "~/t3team/workitem/t3team-useWorkItemFieldMutations";
import { WorkItemAssigneeControl } from "~/t3team/workitem/t3team-WorkItemAssigneeControl";
import { WorkItemEstimateControl } from "~/t3team/workitem/t3team-WorkItemEstimateControl";
import { WorkItemStatusControl } from "~/t3team/workitem/t3team-WorkItemStatusControl";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";

/**
 * Builds the Slice B editable controls for the title band and properties rail, or `undefined` for
 * each when there is no live backend/account to write through — the view then stays exactly as
 * read-only as it was before this slice.
 *
 * A hook, not a plain function, because it also indexes this issue's pending scalar drafts
 * (`useWorkItemDrafts`) so a status/assignee/estimate draft flows straight into the matching
 * control, and because it builds the one shared `useWorkItemFieldMutation` instance per field
 * (`useWorkItemFieldMutations`) that both the chip and the draft strip's Accept action commit
 * through — `mutations` is returned too, for the caller to hand to the strip. Both are read
 * unconditionally, before the early return below, since hooks can't be conditional.
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
  const mutations = useWorkItemFieldMutations({
    issueIdOrKey: model.key,
    model,
    ...(backend ? { backend } : {}),
    ...(accountId ? { accountId } : {}),
    onReload,
  });

  if (!backend || !accountId) {
    return { statusControl: undefined, assigneeControl: undefined, estimateControl: undefined, mutations };
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
        mutation={mutations.status}
      />
    ) : undefined,
    assigneeControl: (
      <WorkItemAssigneeControl
        backend={backend}
        accountId={accountId}
        issueIdOrKey={model.key}
        draft={pickScalarDraft(draftsByField, "assignee")}
        {...(currentUserName ? { currentUserName } : {})}
        mutation={mutations.assignee}
      />
    ),
    estimateControl: (
      <WorkItemEstimateControl
        issueIdOrKey={model.key}
        agentDraft={pickScalarDraft(draftsByField, "estimate")}
        mutation={mutations.estimate}
      />
    ),
    mutations,
  };
}
