export const BACKLOG_SET_ASSIGNEE_FILTER_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: {
      type: "string",
      description: "Filter mode to apply to the visible backlog assignee filter.",
      enum: ["current-user"],
    },
  },
  required: ["mode"],
} as const;

export const ISSUE_ID_PROPERTY = {
  type: "string",
  description:
    "Jira issue id or key. When omitted for a work-item-bound thread, the current work item is used.",
  minLength: 1,
} as const;

export const ASSIGNEE_DRAFT_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    issue_id: ISSUE_ID_PROPERTY,
    assignee_account_id: {
      type: ["string", "null"],
      description: "Jira account id to assign, or null to unassign.",
    },
    assignee_display_name: {
      type: "string",
      description: "Optional display name shown in the draft preview.",
      minLength: 1,
    },
  },
  required: ["assignee_account_id"],
} as const;

export const ESTIMATE_DRAFT_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    issue_id: ISSUE_ID_PROPERTY,
    estimate_value: {
      type: ["number", "null"],
      description: "Estimate value to draft, or null to clear it.",
      minimum: 0,
    },
    estimate_mode: {
      type: "string",
      description: "Whether estimate_value is story points or hours.",
      enum: ["points", "hours"],
    },
  },
  required: ["estimate_value"],
} as const;

export const STATUS_DRAFT_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    issue_id: ISSUE_ID_PROPERTY,
    target_status: {
      type: "string",
      description: "Target Jira status name.",
      minLength: 1,
    },
  },
  required: ["target_status"],
} as const;

export const TEXT_DRAFT_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    issue_id: ISSUE_ID_PROPERTY,
    body: {
      type: "string",
      description: "Draft text body.",
      minLength: 1,
    },
  },
  required: ["body"],
} as const;

export const SUBTASK_DRAFT_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    parent_issue_id: {
      type: "string",
      description: "Parent Jira issue id or key.",
      minLength: 1,
    },
    summary: {
      type: "string",
      description: "Subtask summary.",
      minLength: 1,
    },
    description: {
      type: "string",
      description: "Optional plain-text description.",
      minLength: 1,
    },
    estimate_hours: {
      type: "number",
      description: "Optional original estimate in hours.",
      minimum: 0,
    },
  },
  required: ["parent_issue_id", "summary"],
} as const;
