import { EMPTY_OBJECT_INPUT_SCHEMA, type T3workToolCatalogEntry } from "./t3workToolCatalogCore.js";

const START_CHILD_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: {
      type: "string",
      description: "Name for the new child session.",
      minLength: 1,
    },
    ticket_id: {
      type: "string",
      description:
        "Optional project ticket ID to attach the child session to. When this differs from the current ticket, the new session is attached directly under that ticket instead of nesting under the current thread.",
      minLength: 1,
    },
    kickoff_prompt: {
      type: "string",
      description: "Optional first prompt sent to the child session.",
      minLength: 1,
    },
    kickoff_mode: {
      type: "string",
      description:
        "Optional kickoff style. 'plan' maps to plan mode; 'interactive' and 'autopilot' currently map to the default interaction mode.",
      enum: ["plan", "interactive", "autopilot"],
    },
    model: {
      type: "string",
      description:
        "Optional canonical model slug override for the child session. Prefer omitting this to inherit the current thread model; if you set it, use a provider-specific canonical slug such as 'gpt-5.4' or 'gpt-5.3-codex', not a generic alias like 'gpt-5'.",
      minLength: 1,
    },
    reasoning_effort: {
      type: "string",
      description: "Optional reasoning effort override for the child session.",
      enum: ["low", "medium", "high"],
    },
    repo_full_name: {
      type: "string",
      description:
        "Optional linked repository to open in a fresh scoped worktree, for example 'owner/repo' or 'github.com/owner/repo'.",
      minLength: 1,
    },
    repo_ref: {
      type: "string",
      description:
        "Optional branch, tag, or commit to use as the base ref for that scoped worktree. When omitted, the linked repository default branch is used.",
      minLength: 1,
    },
  },
  required: ["name"],
} as const;

const BACKLOG_SET_ASSIGNEE_FILTER_INPUT_SCHEMA = {
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

export const IMPLEMENTED_T3WORK_TOOL_CATALOG = {
  "t3work.backlog.set_assignee_filter": {
    id: "t3work.backlog.set_assignee_filter",
    label: "Set backlog assignee filter",
    title: "Set visible backlog assignee filter",
    description: "Update the visible backlog assignee filter for the current dashboard view.",
    capabilities: ["write"],
    kind: "view-state",
    surfaces: ["backlog"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: BACKLOG_SET_ASSIGNEE_FILTER_INPUT_SCHEMA,
  },
  "t3work.view.read": {
    id: "t3work.view.read",
    label: "Read view",
    title: "Read current t3work view",
    description: "Read the latest thread, project, and current t3work view context.",
    capabilities: ["read"],
    kind: "read",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: EMPTY_OBJECT_INPUT_SCHEMA,
  },
  "t3work.thread.rename": {
    id: "t3work.thread.rename",
    label: "Rename thread",
    title: "Rename current thread",
    description: "Rename the current thread in t3work.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: {
          type: "string",
          description: "New thread title.",
          minLength: 1,
        },
      },
      required: ["title"],
    },
  },
  "t3work.thread.start_child": {
    id: "t3work.thread.start_child",
    label: "Start child session",
    title: "Start child session",
    description:
      "Create a child t3work session from the current thread and optionally start it immediately. When repo_full_name is provided, the runtime prepares a dedicated scoped worktree for that linked repository; use repo_ref to choose the base branch, tag, or commit.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: START_CHILD_INPUT_SCHEMA,
  },
} as const satisfies Record<string, T3workToolCatalogEntry>;
