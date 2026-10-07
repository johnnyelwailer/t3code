/** A backlog ticket as the t3team store keeps it. Split from `t3team-types` so that module stays small. */
export type ProjectTicket = {
  id: string;
  projectId: string;
  parentId?: string;
  description?: string;
  ref: {
    provider: string;
    kind: string;
    id: string;
    displayId: string;
    title: string;
    type?: string;
    issueTypeIconUrl?: string;
    url: string;
    projectId: string;
  };
  issueType?: string;
  issueTypeIsSubtask?: boolean;
  issueTypeIconUrl?: string;
  status: string;
  priority?: string;
  assignee?: string;
  /** The assignee's Jira face (a public avatar URL). */
  assigneeAvatarUrl?: string;
  assigneeAccountId?: string;
  /** Jira reporter — the digest surfaces it for bugs, where who hit the problem matters. */
  reporter?: string;
  estimateValue?: number;
  timeOriginalEstimateSeconds?: number;
  timeRemainingEstimateSeconds?: number;
  aggregateTimeOriginalEstimateSeconds?: number;
  aggregateTimeRemainingEstimateSeconds?: number;
  subtaskCount?: number;
  sprintId?: string;
  sprintName?: string;
  sprintState?: string;
  sprintBoardId?: string;
  sprintGoal?: string;
  sprintStartDate?: string;
  sprintEndDate?: string;
  sprintCompleteDate?: string;
  updatedAt: string;
  labels?: ReadonlyArray<string>;
  /** Position in the provider's board order (Jira Rank); set for backlog tickets only. */
  boardRank?: number;
};

export type ProjectBacklogSubtaskCreateInput = {
  readonly summary: string;
  readonly description?: string;
  readonly estimateHours?: number;
  readonly issueTypeId?: string;
  readonly assigneeAccountId?: string | null;
};
