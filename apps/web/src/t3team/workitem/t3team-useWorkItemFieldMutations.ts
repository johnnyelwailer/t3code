import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import {
  useWorkItemFieldMutation,
  type WorkItemFieldMutationResult,
} from "~/t3team/workitem/t3team-useWorkItemFieldMutation";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";
import type { WorkItemPerson } from "~/t3team/workitem/t3team-workItemFieldReaders";

export type WorkItemFieldMutations = {
  readonly status: WorkItemFieldMutationResult<string>;
  readonly assignee: WorkItemFieldMutationResult<WorkItemPerson | null>;
  readonly estimate: WorkItemFieldMutationResult<number | null>;
};

function assigneeIdentity(person: WorkItemPerson | null): string | null {
  return person ? (person.accountId ?? person.displayName) : null;
}

/**
 * One `useWorkItemFieldMutation` instance per field, built once here and shared by the direct-edit
 * chip and the draft strip's Accept action for that field.
 *
 * This is the fix for a real inconsistency: two independent instances (one built inside each chip,
 * one built inside the strip) would each hold their own optimistic value and undo window, so
 * accepting a proposal from the strip would silently show no undo anywhere. Sharing one instance
 * means accepting from the strip *is* a commit through the same state a direct edit uses — same
 * optimistic apply, same rollback, same 10s undo banner, in the same place (the chip).
 *
 * Called unconditionally from `useWorkItemDetailMainControls` (always mounted, since the chips
 * always need their mutation regardless of whether the strip is open) — each `mutate` guards on
 * `backend`/`accountId` internally so this stays safe to call in the read-only case too.
 */
export function useWorkItemFieldMutations(input: {
  readonly issueIdOrKey: string;
  readonly model: WorkItemFieldModel;
  readonly backend?: AtlassianBackendApi | undefined;
  readonly accountId?: string | undefined;
  readonly onReload: () => void;
}): WorkItemFieldMutations {
  const { issueIdOrKey, model, backend, accountId, onReload } = input;

  const status = useWorkItemFieldMutation<string>({
    value: model.status?.name ?? "",
    action: "changing the status",
    mutate: async (targetStatus) => {
      if (!backend || !accountId) return;
      await backend.updateIssueStatus({ accountId, issueIdOrKey, targetStatus });
      onReload();
    },
  });

  const assignee = useWorkItemFieldMutation<WorkItemPerson | null>({
    value: model.assignee ?? null,
    action: "updating the assignee",
    isEqual: (a, b) => assigneeIdentity(a) === assigneeIdentity(b),
    mutate: async (next) => {
      if (!backend || !accountId) return;
      await backend.updateIssueAssignee({
        accountId,
        issueIdOrKey,
        assigneeAccountId: next?.accountId ?? null,
        assigneeDisplayName: next?.displayName ?? null,
      });
      onReload();
    },
  });

  const estimate = useWorkItemFieldMutation<number | null>({
    value: model.storyPoints ?? null,
    action: "updating story points",
    mutate: async (nextValue) => {
      if (!backend || !accountId) return;
      await backend.updateIssueEstimate({
        accountId,
        issueIdOrKey,
        estimateValue: nextValue,
        estimateMode: "points",
      });
      onReload();
    },
  });

  return { status, assignee, estimate };
}
