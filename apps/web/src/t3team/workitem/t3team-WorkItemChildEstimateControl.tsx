import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { useWorkItemFieldMutation } from "~/t3team/workitem/t3team-useWorkItemFieldMutation";
import { WorkItemEstimateControl } from "~/t3team/workitem/t3team-WorkItemEstimateControl";

/**
 * One story-points mutation per child row — the estimate counterpart to
 * {@link WorkItemChildAssigneeControl}, for the same reason: `useWorkItemFieldMutation` is a hook,
 * so it cannot be shared across a `.map()` of children the way the issue header shares one instance
 * per field. Wraps {@link WorkItemEstimateControl} unchanged (same popover, same Enter-to-save /
 * Escape-to-cancel input, same `t3team-workItemEstimateParsing.ts` validation) rather than cloning
 * it, scoped to this child's own issue key so `backend.updateIssueEstimate` writes the right ticket.
 */
export function WorkItemChildEstimateControl({
  child,
  backend,
  accountId,
  onReload,
}: {
  readonly child: ProjectTicket;
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly onReload: () => void;
}) {
  // Same fallback every other control here uses: Jira's API key is the display key, not the
  // internal id.
  const issueIdOrKey = child.ref.displayId ?? child.id;

  const mutation = useWorkItemFieldMutation<number | null>({
    value: child.estimateValue ?? null,
    action: "updating story points",
    mutate: async (nextValue) => {
      await backend.updateIssueEstimate({
        accountId,
        issueIdOrKey,
        estimateValue: nextValue,
        estimateMode: "points",
      });
      onReload();
    },
  });

  return <WorkItemEstimateControl issueIdOrKey={issueIdOrKey} mutation={mutation} />;
}
