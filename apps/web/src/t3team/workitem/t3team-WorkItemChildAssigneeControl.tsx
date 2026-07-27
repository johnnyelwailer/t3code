import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { useWorkItemFieldMutation } from "~/t3team/workitem/t3team-useWorkItemFieldMutation";
import { WorkItemAssigneeControl } from "~/t3team/workitem/t3team-WorkItemAssigneeControl";
import type { WorkItemPerson } from "~/t3team/workitem/t3team-workItemFieldReaders";

function assigneeIdentity(person: WorkItemPerson | null): string | null {
  return person ? (person.accountId ?? person.displayName) : null;
}

/** Reads a child ticket's current assignee into the `WorkItemPerson | null` shape the shared control expects. */
export function childAssigneeValue(child: ProjectTicket): WorkItemPerson | null {
  if (!child.assignee) return null;
  return {
    displayName: child.assignee,
    ...(child.assigneeAccountId ? { accountId: child.assigneeAccountId } : {}),
  };
}

/**
 * One assignee mutation per child row.
 *
 * `useWorkItemFieldMutation` is a hook, so it cannot be built once and reused across a `.map()` of
 * children the way `useWorkItemDetailMainControls` shares a single instance for the issue header —
 * each child needs its own instance, scoped to its own issue key. This wraps
 * {@link WorkItemAssigneeControl} unchanged rather than cloning its popover: same search, same
 * "assign to me"/"unassign" rows, same optimistic-apply/rollback/10s-undo path
 * `backend.updateIssueAssignee` already gives every other assignee chip.
 */
export function WorkItemChildAssigneeControl({
  child,
  backend,
  accountId,
  currentUserName,
  onReload,
}: {
  readonly child: ProjectTicket;
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly currentUserName?: string | undefined;
  readonly onReload: () => void;
}) {
  // Jira's API key for a ticket is its display key (e.g. "T3T-42"), matching how every other
  // control here derives `issueIdOrKey` off `ref.displayId` rather than the internal `id`.
  const issueIdOrKey = child.ref.displayId ?? child.id;

  const mutation = useWorkItemFieldMutation<WorkItemPerson | null>({
    value: childAssigneeValue(child),
    action: "updating the assignee",
    isEqual: (a, b) => assigneeIdentity(a) === assigneeIdentity(b),
    mutate: async (next) => {
      await backend.updateIssueAssignee({
        accountId,
        issueIdOrKey,
        assigneeAccountId: next?.accountId ?? null,
        assigneeDisplayName: next?.displayName ?? null,
      });
      onReload();
    },
  });

  return (
    <WorkItemAssigneeControl
      backend={backend}
      accountId={accountId}
      issueIdOrKey={issueIdOrKey}
      {...(currentUserName ? { currentUserName } : {})}
      mutation={mutation}
    />
  );
}
