import { EMPTY_OBJECT_INPUT_SCHEMA, type T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";

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
      description:
        "Optional PROVIDER-SPECIFIC reasoning effort override for the child session. Prefer the provider-agnostic 'effort' unless you need this exact value; 'reasoning_effort' wins when both are given.",
      enum: ["low", "medium", "high"],
    },
    effort: {
      type: "string",
      description:
        "Optional provider-agnostic thinking tier for the child session. Ask for a tier without naming a provider or model: it is mapped onto whatever reasoning control the resolved provider/model exposes, and is ignored when it exposes none.",
      enum: ["light", "standard", "high"],
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
        'Raw SVG (starting with <svg>) or an HTML fragment. Do NOT include <!DOCTYPE>, <html>, <head>, or <body> tags. The widget renders in a sandboxed iframe with the live app theme. Use the provided variables for ALL colors: var(--background), var(--foreground), var(--card), var(--card-foreground), var(--muted), var(--muted-foreground), var(--border), var(--primary), var(--primary-foreground), var(--secondary), var(--secondary-foreground), var(--accent), var(--accent-foreground), var(--destructive), var(--ring), var(--popover), var(--input), and the status tokens var(--info), var(--success), var(--warning) (each with a matching -foreground). Use var(--font-sans) / var(--font-mono) for typography and var(--radius) for corners. Never hard-code light or dark palette colors; the same markup must remain readable in both modes. Build mobile-first and fluid: use width:100% and the available host width, avoid fixed card widths/max-widths that leave a narrow mobile card on desktop, and adapt dense layouts with container or media queries. Keep content compact and use progressive disclosure/collapsible details; the host auto-sizes to content so chat owns scrolling. Use internal scrolling only for intrinsically large tables or logs. Keep the outer background transparent and add no top-level padding. For icons, use the host-injected sprite instead of emoji or Unicode pictograms: <svg class="t3w-icon" aria-hidden="true"><use href="#t3w-icon-NAME" /></svg>, adding class t3w-icon-lg for 20px. Available NAME values: arrow-right, ban, calendar, check, chevron-down, chevron-right, circle-alert, circle-check, circle-dot, circle-x, clock, external-link, file-text, git-pull-request, info, list, loader-circle, minus, plus, search, shield, sparkles, trending-down, trending-up, triangle-alert, user, x. They draw in currentColor, so set color (e.g. color: var(--success)) on the icon or its container — use circle-check/triangle-alert/circle-x instead of the check, warning and blocked emoji. Hand-written inline SVG using currentColor at 16px or 20px is fine for anything the sprite lacks; never depend on an external icon library. Scripts are allowed, but a strict CSP blocks ALL external network access (no fetch/XHR/WebSockets, no CDN scripts, no remote images/fonts) — inline all CSS/JS and embed assets as data: URIs. Globals inside the widget: sendPrompt(text) starts a hidden, agent-visible turn from a real user gesture (it does not answer workflow askUser prompts and is rate-limited); window.host.callTool(name, args) returns a Promise with a broker tool result, but only for tools declared in capabilities.tools.',
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
        "Optional runtime capabilities. tools is an allowlist of t3team broker tool names the widget's window.host.callTool bridge may invoke. Omitted or empty = no tool access.",
      properties: {
        tools: { type: "array", items: { type: "string" } },
      },
    },
  },
  required: ["title", "widget_code"],
} as const;

export const IMPLEMENTED_T3TEAM_TOOL_CATALOG = {
  "t3team.widget.show": {
    id: "t3team.widget.show",
    label: "Show widget",
    title: "Show an inline widget in the chat timeline",
    description:
      "Show a widget inline in the current thread's chat timeline. Single entry point for all widget fidelities, selected via 'format': html/svg render instantly in a sandboxed iframe with live light/dark theme CSS variables plus the sendPrompt/callTool bridge; mdx (future) renders trusted whitelisted first-party components inline; tsx (future) composes a full design-system-native React view (slower). The widget body is persisted as a durable artifact. Use only provided theme variables for colors. Make the widget fluid and responsive across mobile and wide panes, keep it compact with progressive disclosure, keep the background transparent, and avoid top-level padding. Render icons from the host-injected sprite (<use href=\"#t3w-icon-NAME\">, class t3w-icon) rather than emoji or an external icon dependency.",
    capabilities: ["write"],
    kind: "view-state",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: WIDGET_SHOW_INPUT_SCHEMA,
  },
  "t3team.backlog.set_assignee_filter": {
    id: "t3team.backlog.set_assignee_filter",
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
  "t3team.view.read": {
    id: "t3team.view.read",
    label: "Read view",
    title: "Read current t3team view",
    description: "Read the latest thread, project, and current t3team view context.",
    capabilities: ["read"],
    kind: "read",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: EMPTY_OBJECT_INPUT_SCHEMA,
  },
  "t3team.recipe.list": {
    id: "t3team.recipe.list",
    label: "List project recipes",
    title: "List t3team project recipes",
    description:
      "List the t3team project recipes discovered in this project's workspace (.t3team/recipes/) — t3team project recipes are directories bundling a typed recipe.ts module (or legacy recipe.json manifest) with a .workflow.ts the t3team workflow engine runs; they are NOT Claude Code skills or provider-native workflows. Returns each recipe's id, title, shortDescription, surfaces, authoring form ('recipe-ts' typed module vs 'recipe-json' legacy manifest), recipe directory, and resolved workflow path, plus structured errors for recipes that failed to load. Read-only: nothing is written or launched.",
    capabilities: ["read"],
    kind: "read",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: EMPTY_OBJECT_INPUT_SCHEMA,
  },
  "t3team.recipe.validate": {
    id: "t3team.recipe.validate",
    label: "Validate recipe workflow",
    title: "Validate a t3team recipe workflow statically",
    description:
      "Statically validate a t3team project recipe workflow (.workflow.ts) — t3team project recipes, NOT Claude Code skills or provider-native workflows. Run this after authoring or editing recipe/workflow files: it loads the file through the SDK loader, extracts the meta block (name, description, input/output fields, capabilities), derives the same play-as-shape preview the UI shows (phases + read/agent/ask/act steps), and returns structured errors ({path, phase: discover|load|meta|shape, message}) precise enough to fix the file from. Accepts a path to a .workflow.ts file or to a recipe directory, relative to the project workspace root; paths outside the workspace are rejected. Read-only and safe: the workflow body is never executed.",
    capabilities: ["read"],
    kind: "read",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description:
            "Path to a .workflow.ts file or a recipe directory, relative to the project workspace root (absolute paths must stay inside the workspace).",
          minLength: 1,
        },
      },
      required: ["path"],
    },
  },
  "t3team.orchestration.run": {
    id: "t3team.orchestration.run",
    label: "Run ephemeral orchestration",
    title: "Run a temporary agent orchestration in this conversation",
    description:
      "Run a temporary agent orchestration immediately in this conversation — a durable, journaled t3team engine run that can pause for user decisions; NOT a Claude Code/Codex/CI workflow. Pass exactly one of 'source' (inline orchestration TypeScript, persisted under .t3team-runs/<runId>/) or 'workflowPath' (existing .workflow.ts in the workspace). Body format: .t3team/recipes/AUTHORING.md; validate with t3team.recipe.validate first. Returns {runId, status: accepted|completed|suspended|failed, handoff: 'workflow-ui', output?, error?}. A successful 'workflow-ui' handoff means the orchestration card owns progress: end the current turn immediately with no follow-up assistant prose. A user decision appears on that card and resumes the orchestration on reply — do not poll. On 'failed', fix the source using 'error' and re-run. No approval gate; at most 8 live ephemeral runs.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        source: {
          type: "string",
          description:
            "Inline orchestration TypeScript (meta + top-level body). Exactly one of source/workflowPath.",
          minLength: 1,
        },
        workflowPath: {
          type: "string",
          description:
            "Path to an existing .workflow.ts, relative to the project workspace root (absolute paths must stay inside the workspace). Exactly one of source/workflowPath.",
          minLength: 1,
        },
        args: {
          description: "Launch arguments decoded by the orchestration's meta.inputs schema.",
        },
      },
    },
  },
  "t3team.thread.rename": {
    id: "t3team.thread.rename",
    label: "Rename thread",
    title: "Rename current thread",
    description: "Rename the current thread in t3team.",
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
  "t3team.thread.search": {
    id: "t3team.thread.search",
    label: "Search this thread",
    title: "Search this thread's transcript",
    description:
      "Search the messages of the CURRENT thread (its own transcript) — e.g. to recover a prior decision or context that scrolled out of the context window. Pass a case-insensitive 'query' substring, an optional 'limit' (default 10, max 25), and an optional 'role' filter ('user' | 'assistant' | 'actor'). Returns each matching message with its 1-based position, role, a snippet around the match, and message_id (pass message_id to t3team.thread.read_message for the full body).",
    capabilities: ["read"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description: "Case-insensitive substring to search for in this thread's messages.",
          minLength: 1,
        },
        limit: {
          type: "number",
          description: "Maximum number of matches to return (default 10, max 25).",
        },
        role: {
          type: "string",
          description:
            "Optional role filter: only return messages from this role ('user', 'assistant', or 'actor').",
          enum: ["user", "assistant", "actor"],
        },
      },
      required: ["query"],
    },
  },
  "t3team.thread.search_source": {
    id: "t3team.thread.search_source",
    label: "Search fork source thread",
    title: "Search the fork source thread",
    description:
      "Search the FULL transcript of the thread this thread was forked from — including the middle messages a truncated fork omitted. Only works in a forked thread. Pass a case-insensitive 'query' substring and an optional 'limit' (default 10, max 25). Returns each matching message with its 1-based position, role, and a snippet around the match.",
    capabilities: ["read"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description:
            "Case-insensitive substring to search for in the original thread's messages.",
          minLength: 1,
        },
        limit: {
          type: "number",
          description: "Maximum number of matches to return (default 10, max 25).",
        },
      },
      required: ["query"],
    },
  },
  "t3team.thread.read_message": {
    id: "t3team.thread.read_message",
    label: "Read inter-agent message",
    title: "Read the full body of an inter-agent message",
    description:
      "Read the FULL body of a previously delivered inter-agent message (sent with t3team_send_message) in this thread. Long inter-agent bodies are truncated on delivery; the truncation marker in the delivered preview carries the message id. Pass that 'message_id' to retrieve the full persisted text.",
    capabilities: ["read"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        message_id: {
          type: "string",
          description: "Message id from the inter-agent delivery truncation marker.",
          minLength: 1,
        },
      },
      required: ["message_id"],
    },
  },
  "t3team.thread.start_child": {
    id: "t3team.thread.start_child",
    label: "Start child session",
    title: "Start child session",
    description:
      "Create a child t3team session from the current thread and optionally start it immediately. execution_scope is required: 'metarepo' stays in the project metarepo workspace without repo_full_name; 'repository' requires repo_full_name and prepares a dedicated scoped worktree for that linked repository.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: START_CHILD_INPUT_SCHEMA,
  },
  "t3team.thread.children": {
    id: "t3team.thread.children",
    label: "Manage child sessions",
    title: "Manage this thread's child sessions",
    description:
      "Manage this thread's child sessions (STATE, not content — use send_message to talk to a child). One tool; `op` selects the operation:\n" +
      "- list: this thread's children with live state (all:true = whole project)\n" +
      "- status: one thread's current turn state, in-progress work, elapsed\n" +
      "- wait: durably resume this turn when a child reaches a terminal state (on: terminal|completed|failed; timeout in ms)\n" +
      "- stop: halt a child's running turn\n" +
      "- close: mark a child done from this side\n" +
      "- help: exact schema for one op (op_name)",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        op: {
          type: "string",
          description: "The operation to perform: list, status, wait, stop, close, or help.",
          enum: ["list", "status", "wait", "stop", "close", "help"],
        },
        thread_id: {
          type: "string",
          description: "Target child thread id. Required for status, wait, stop, and close.",
          minLength: 1,
        },
        on: {
          type: "string",
          description: "For wait: which terminal outcome resumes this turn (default terminal).",
          enum: ["terminal", "completed", "failed"],
        },
        timeout: {
          type: "number",
          description: "For wait: optional timeout in milliseconds.",
        },
        all: {
          type: "boolean",
          description:
            "For list: when true, list the whole project instead of this thread's children.",
        },
        reason: {
          type: "string",
          description: "For stop: optional reason recorded with the stop.",
        },
        op_name: {
          type: "string",
          description: "For help: which op's schema to return. Omit for all ops.",
        },
      },
      required: ["op"],
    },
  },
  "t3team.work_item.refresh_context_bundle": {
    id: "t3team.work_item.refresh_context_bundle",
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
  "t3team.project.refresh_context_bundle": {
    id: "t3team.project.refresh_context_bundle",
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
} as const satisfies Record<string, T3TeamToolCatalogEntry>;
