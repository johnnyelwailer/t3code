import type { WorkItemPerson } from "~/t3team/workitem/t3team-workItemFieldReaders";

/**
 * Stable identity for an assignee, used to compare two picker selections.
 *
 * Shared because both `WorkItemAssigneeControl` and `WorkItemChildAssigneeControl` had their own
 * identical copy. `accountId` first and `displayName` only as a fallback: a directory result may
 * carry no account id, and comparing those by name is better than treating every one as distinct.
 */
export function assigneeIdentity(person: WorkItemPerson | null): string | null {
  return person ? (person.accountId ?? person.displayName) : null;
}
