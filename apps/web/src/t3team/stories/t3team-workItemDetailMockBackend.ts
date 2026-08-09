import type { Dispatch, SetStateAction } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type { AtlassianAssignableUser } from "~/t3team/backend/t3team-types";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";

const DEMO_ASSIGNABLE_USERS: ReadonlyArray<AtlassianAssignableUser> = [
  { accountId: "acc-ada", displayName: "Ada Lovelace", emailAddress: "ada@example.test" },
  { accountId: "acc-alan", displayName: "Alan Turing", emailAddress: "alan@example.test" },
  { accountId: "acc-grace", displayName: "Grace Hopper", emailAddress: "grace@example.test" },
];

const DEMO_STATUS_NAMES = ["To Do", "In Progress", "In Review", "Done"];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type EditableWorkItemBackend = Pick<
  AtlassianBackendApi,
  | "updateIssueStatus"
  | "updateIssueAssignee"
  | "updateIssueEstimate"
  | "searchAssignableUsers"
  | "getBoardColumns"
>;

/**
 * A believable-enough Atlassian backend for the Storybook "Editable" story: it mutates the model
 * held by the story's own component state instead of a real Jira site, with a short delay so the
 * pending spinner and optimistic apply are visible while clicking through.
 */
export function createWorkItemDetailMockBackend(
  setModel: Dispatch<SetStateAction<WorkItemFieldModel>>,
): EditableWorkItemBackend {
  return {
    updateIssueStatus: async ({ targetStatus }) => {
      await delay(400);
      setModel((model) => ({ ...model, status: { name: targetStatus } }));
      return { status: targetStatus };
    },
    updateIssueAssignee: async ({ assigneeAccountId, assigneeDisplayName }) => {
      await delay(400);
      setModel((model) => {
        if (!assigneeAccountId) {
          const { assignee: _assignee, ...rest } = model;
          return rest;
        }
        return {
          ...model,
          assignee: { accountId: assigneeAccountId, displayName: assigneeDisplayName ?? "" },
        };
      });
    },
    updateIssueEstimate: async ({ estimateValue }) => {
      await delay(400);
      setModel((model) => {
        if (estimateValue === null) {
          const { storyPoints: _storyPoints, ...rest } = model;
          return rest;
        }
        return { ...model, storyPoints: estimateValue };
      });
      return { label: "Story Points" };
    },
    searchAssignableUsers: async ({ query }) => {
      await delay(200);
      const normalized = query?.trim().toLowerCase();
      return normalized
        ? DEMO_ASSIGNABLE_USERS.filter((user) =>
            user.displayName.toLowerCase().includes(normalized),
          )
        : DEMO_ASSIGNABLE_USERS;
    },
    getBoardColumns: async () => ({
      availableStatuses: DEMO_STATUS_NAMES.map((name) => ({ name })),
      boardColumns: [],
    }),
  };
}
