import { EMPTY_OBJECT_INPUT_SCHEMA, type T3workToolCatalogEntry } from "./t3workToolCatalogCore.ts";

const START_CHILD_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: {
      type: "string",
      description: "Name for the new child session.",
      minLength: 1,
    },
    execution_scope: {
      type: "string",
      description:
        "Required execution scope. Use 'metarepo' for project planning, triage, and synthesis in the project workspace. Use 'repository' for implementation, debugging, tests, review, or PR work in a dedicated linked-repository worktree.",
      enum: ["metarepo", "repository"],
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
        "Required when execution_scope is 'repository' and forbidden when execution_scope is 'metarepo'. Linked repository to open in a fresh scoped worktree, for example 'owner/repo' or 'github.com/owner/repo'.",
      minLength: 1,
    },
    repo_ref: {
      type: "string",
      description:
        "Optional branch, tag, or commit to use as the base ref for the repository scoped worktree. Only valid when execution_scope is 'repository'. When omitted, the linked repository default branch is used.",
      minLength: 1,
    },
  },
  required: ["name", "execution_scope"],
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

const WIDGET_SHOW_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: {
      type: "string",
      description:
        "Short snake_case identifier for this widget (e.g. 'q4_revenue_chart'). Used as the artifact name.",
      minLength: 1,
    },
    widget_code: {
      type: "string",
      description:
        "Raw SVG (starting with <svg>) or an HTML fragment. Do NOT include <!DOCTYPE>, <html>, <head>, or <body> tags. The widget renders in a sandboxed iframe with the app's theme CSS variables available (use var(--background), var(--foreground), var(--muted), var(--border), ...), a transparent background, and no top-level padding. Scripts are allowed, but a strict CSP blocks ALL external network access (no fetch/XHR/WebSockets, no CDN scripts, no remote images/fonts) — inline all CSS/JS and embed assets as data: URIs. Globals inside the widget: sendPrompt(text) sends a chat message as if the user typed it (requires a real user gesture inside the widget, e.g. a button click, and is rate-limited); window.host.callTool(name, args) returns a Promise with a broker tool result, but only for tools declared in capabilities.tools.",
      minLength: 1,
    },
    format: {
      type: "string",
      description:
        "Widget fidelity tier. 'html'/'svg': instant, sandboxed iframe with theme CSS variables and the sendPrompt/callTool bridge (default; auto-detected from widget_code — starts with <svg → svg, else html). 'mdx': trusted whitelisted first-party components rendered inline (not yet available). 'tsx': full React view via the registered-view compose pipeline — slower, design-system-native (not yet available).",
      enum: ["html", "svg", "mdx", "tsx"],
    },
    loading_messages: {
      type: "array",
      description: "Optional short placeholder messages shown while the widget renders.",
      items: { type: "string" },
    },
    capabilities: {
      type: "object",
      additionalProperties: false,
      description:
        "Optional runtime capabilities. tools is an allowlist of t3work broker tool names the widget's window.host.callTool bridge may invoke. Omitted or empty = no tool access.",
      properties: {
        tools: { type: "array", items: { type: "string" } },
      },
    },
  },
  required: ["title", "widget_code"],
} as const;

export const IMPLEMENTED_T3WORK_TOOL_CATALOG = {
  "t3work.widget.show": {
    id: "t3work.widget.show",
    label: "Show widget",
    title: "Show an inline widget in the chat timeline",
    description:
      "Show a widget inline in the current thread's chat timeline. Single entry point for all widget fidelities, selected via 'format': html/svg render instantly in a sandboxed iframe with theme CSS variables plus the sendPrompt/callTool bridge; mdx (future) renders trusted whitelisted first-party components inline; tsx (future) composes a full design-system-native React view (slower). The widget body is persisted as a durable artifact. Keep the background transparent and avoid top-level padding.",
    capabilities: ["write"],
    kind: "view-state",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: WIDGET_SHOW_INPUT_SCHEMA,
  },
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
      "Create a child t3work session from the current thread and optionally start it immediately. execution_scope is required: 'metarepo' stays in the project metarepo workspace without repo_full_name; 'repository' requires repo_full_name and prepares a dedicated scoped worktree for that linked repository.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: START_CHILD_INPUT_SCHEMA,
  },
  "t3work.work_item.refresh_context_bundle": {
    id: "t3work.work_item.refresh_context_bundle",
    label: "Refresh work item context bundle",
    title: "Refresh work item context bundle",
    description:
      "Build and persist the full Jira work-item context bundle for the current or specified ticket. Workspace auto-sync keeps lightweight summaries; this tool loads the same rich tree used by add-to-chat.",
    capabilities: ["write"],
    kind: "read",
    surfaces: ["work-item", "thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ticket_key: {
          type: "string",
          description:
            "Optional Jira issue key in the current project. Defaults to the bound work item for this thread.",
          minLength: 1,
        },
        force: {
          type: "boolean",
          description: "When true, rebuild even if the existing full bundle is fresh.",
        },
      },
    },
  },
  "t3work.project.refresh_context_bundle": {
    id: "t3work.project.refresh_context_bundle",
    label: "Refresh project context bundle",
    title: "Refresh project context bundle",
    description:
      "Rebuild and persist the lightweight project context bundle (work-items index and summary JSON) for the current project workspace.",
    capabilities: ["write"],
    kind: "read",
    surfaces: ["project", "thread"],
    status: "implemented",
    defaultEnabled: false,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        force: {
          type: "boolean",
          description: "When true, rebuild even if the existing project bundle is fresh.",
        },
      },
    },
  },
} as const satisfies Record<string, T3workToolCatalogEntry>;
