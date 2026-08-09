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

export const WORK_ITEM_SUBTASK_DRAFT_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    issue_id: ISSUE_ID_PROPERTY,
    summary: {
      type: "string",
      description: "Child issue summary.",
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
  required: ["summary"],
} as const;

export const LINK_DRAFT_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    issue_id: ISSUE_ID_PROPERTY,
    other_issue_id: {
      type: "string",
      description: "The other Jira issue id or key to link to.",
      minLength: 1,
    },
    link_type_name: {
      type: "string",
      description: 'Jira link type name, e.g. "Blocks" or "Relates".',
      minLength: 1,
    },
    direction: {
      type: "string",
      description: "Whether the current issue is the inward or outward side of the link type.",
      enum: ["inward", "outward"],
    },
  },
  required: ["other_issue_id", "link_type_name", "direction"],
} as const;

export const LINK_REMOVE_DRAFT_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    issue_id: ISSUE_ID_PROPERTY,
    link_id: {
      type: "string",
      description: "Jira issue link id to remove.",
      minLength: 1,
    },
  },
  required: ["link_id"],
} as const;
