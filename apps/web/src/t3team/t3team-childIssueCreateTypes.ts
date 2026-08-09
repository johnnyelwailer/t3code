import type { AtlassianAssignableUser } from "~/t3team/backend/t3team-types";

/**
 * The one child-issue create draft, shared by the backlog row and the work-item detail's Children
 * section — summary alone (the previous title-only forms) undersold what `createSubtask` can
 * already carry (`ProjectBacklogSubtaskCreateInput` has description/estimateHours) and what Jira
 * itself collects when creating a child issue: issue type, assignee, estimate, description.
 */
export type ChildIssueCreateDraft = {
  readonly summary: string;
  readonly description: string;
  readonly estimateHours: string;
  readonly issueTypeId: string | null;
  readonly assignee: AtlassianAssignableUser | null;
};

export const EMPTY_CHILD_ISSUE_CREATE_DRAFT: ChildIssueCreateDraft = {
  summary: "",
  description: "",
  estimateHours: "",
  issueTypeId: null,
  assignee: null,
};
