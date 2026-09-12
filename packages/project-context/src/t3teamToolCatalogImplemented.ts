import { EMPTY_OBJECT_INPUT_SCHEMA, type T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";
import { T3TEAM_WIDGET_AUTHORING_GUIDANCE } from "./t3teamWidgetGuidance.ts";

const START_CHILD_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: {
      type: "string",
      description: "Name for the new child session.",
      minLength: 1,
    },
    isolation: {
      type: "string",
      description:
        "Required. Where the child works: 'shared' = the project's shared checkout, no new branch or worktree (planning, triage, synthesis, read-only review); 'own-worktree' = a dedicated branch + worktree (implementation, debugging, tests, PR work). With 'own-worktree', pass 'repo_full_name' when the project has linked repos; in a local workspace omit it to isolate in the local repository.",
      enum: ["shared", "own-worktree"],
    },
    execution_scope: {
      type: "string",
      description:
        "Deprecated alias for 'isolation' ('metarepo' maps to 'shared', 'repository' maps to 'own-worktree'). Use 'isolation' instead; do not pass both.",
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
    provider: {
      type: "string",
      description:
        "Optional provider INSTANCE id for cross-provider routing. Read it from t3team.runtime.models immediately before the call; never use a driver family or guessed id.",
      minLength: 1,
    },
    model: {
      type: "string",
      description:
        "Optional exact model slug override for the child session. Prefer omitting this to inherit; otherwise read the slug from t3team.runtime.models for the selected provider instance.",
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
        "Optional, only with isolation='own-worktree'. Linked repository to open in a fresh scoped worktree, for example 'owner/repo' or 'github.com/owner/repo'. Required in projects that have linked repos; omit it in a local workspace (no linked repos) to isolate the child in a worktree of the local repository instead.",
      minLength: 1,
    },
    repo_ref: {
      type: "string",
      description:
        "Optional branch, tag, or commit to use as the base ref for the child's worktree (linked or local). Only valid with isolation='own-worktree'. When omitted, the repository default branch is used.",
      minLength: 1,
    },
  },
  required: ["name", "isolation"],
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
      description: T3TEAM_WIDGET_AUTHORING_GUIDANCE,
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

const ASK_USER_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    question: {
      type: "string",
      description:
        "The full context plus the question itself; markdown is rendered in the composer panel.",
      minLength: 1,
    },
    header: {
      type: "string",
      description: "Short chip label shown beside the question — a few words, not a sentence.",
    },
    options: {
      type: "array",
      description:
        "Optional answer choices offered as buttons. Each option is a string (label only) or " +
        "{label, description} where description explains the choice's trade-off — never just " +
        "the label again. The user can also type a free-form answer.",
      items: {
        anyOf: [
          { type: "string" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string", minLength: 1 },
              description: {
                type: "string",
                description: "What this choice means and its trade-off — never a restatement of the label.",
              },
            },
            required: ["label"],
          },
        ],
      },
    },
    multiSelect: {
      type: "boolean",
      description: "When true (with options), the user may pick several options.",
    },
    allowFreeText: {
      type: "boolean",
      description: "When false, the user may only pick from the listed options (requires options).",
    },
  },
  required: ["question"],
} as const;

export const IMPLEMENTED_T3TEAM_TOOL_CATALOG = {
  "t3team.runtime.models": {
    id: "t3team.runtime.models",
    label: "List runtime models",
    title: "List live provider instances and models",
    description:
      "Read the current thread's true model selection and every provider instance/model from " +
      "the live ProviderRegistry snapshots. Call this before naming an exact provider or model " +
      "in start_child or an orchestration; never guess ids from examples or a static list.",
    capabilities: ["read"],
    kind: "read",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: EMPTY_OBJECT_INPUT_SCHEMA,
  },
  "t3team.runtime.provider_usage": {
    id: "t3team.runtime.provider_usage",
    label: "Read provider usage limits",
    title: "Sample live provider plan-limit windows",
    description:
      "Read the provider's LIVE rolling plan-limit windows (how much of the 5-hour / weekly quota is used, when it resets, and the severity verdict) by sampling each configured provider instance on demand. Call it when you need to know how close a provider is to a rate-limit wall before delegating long work to it, or when a provider start fails with a rate-limit error. Unsampleable instances are reported in `unavailable` with a reason instead of failing the call.",
    capabilities: ["read"],
    kind: "read",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        provider_instance_id: {
          type: "string",
          description:
            "Optional provider INSTANCE id to sample (as returned by t3team.runtime.models). Omit to sample all enabled instances with a live-limit source.",
        },
      },
    },
  },
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
  "t3team.orchestration.status": {
    id: "t3team.orchestration.status",
    label: "Observe orchestration run",
    title: "Observe an ephemeral agent orchestration run",
    description:
      "Read-only observability for a run launched via t3team.orchestration.run: its status " +
      "(accepted|completed|suspended|failed), what it is waiting on, and a one-sentence " +
      "next-step hint. Pass 'runId' to inspect one run — scoped to the calling thread's own " +
      "runs, an unknown id and another thread's run answer identically; omit it to list the " +
      "most recently updated runs. Prefer this over guessing from silence after a handoff.",
    capabilities: ["read"],
    kind: "read",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        runId: {
          type: "string",
          description:
            "Run id returned by t3team.orchestration.run. Omit to list recently updated runs.",
          minLength: 1,
        },
      },
    },
  },
  "t3team.orchestration.resume": {
    id: "t3team.orchestration.resume",
    label: "Resume orchestration run",
    title: "Resume a paused or failed agent orchestration run",
    description:
      "Resume a paused or failed run launched via t3team.orchestration.run, from its durable " +
      "journal (same-prefix replay: journaled steps return their recorded results, execution " +
      "continues live past the recorded frontier). Pass the 'runId' from " +
      "t3team.orchestration.run or t3team.orchestration.status; optionally pass a corrected " +
      "'source' for an ephemeral run (same-prefix replay — do not change already-executed " +
      "steps). Scoped to the calling thread's own runs. Returns {runId, status: " +
      "accepted|suspended|sleeping, hint}; observe progress via t3team.orchestration.status.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        runId: {
          type: "string",
          description: "Run id of the paused or failed run to resume.",
          minLength: 1,
        },
        source: {
          type: "string",
          description:
            "Optional corrected orchestration TypeScript, applied before resuming an ephemeral " +
            "run past its recorded frontier.",
          minLength: 1,
        },
      },
      required: ["runId"],
    },
  },
  "t3team.orchestration.pause": {
    id: "t3team.orchestration.pause",
    label: "Pause orchestration run",
    title: "Pause an agent orchestration run at its current waiting point",
    description:
      "Pause a run launched via t3team.orchestration.run at its current waiting point (a parked " +
      "agent turn, user decision, or timer) — the same control as the card's Pause button. The " +
      "run keeps its continuation; resume it with t3team.orchestration.resume. Scoped to the " +
      "calling thread's own runs. Returns {runId, status: 'paused', hint}.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        runId: {
          type: "string",
          description: "Run id of the waiting or scheduled run to pause.",
          minLength: 1,
        },
      },
      required: ["runId"],
    },
  },
  "t3team.orchestration.stop": {
    id: "t3team.orchestration.stop",
    label: "Stop orchestration run",
    title: "Stop an agent orchestration run for good",
    description:
      "Stop a run launched via t3team.orchestration.run: cancels it, interrupts its child agent " +
      "turns, and frees its capacity — the same control as the card's Stop action. Use it on a " +
      "superseded or stuck run BEFORE launching a replacement, so two runs never work the same " +
      "queue. Scoped to the calling thread's own runs. Returns {runId, status: 'cancelled', hint}.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        runId: {
          type: "string",
          description: "Run id of the live run to stop.",
          minLength: 1,
        },
      },
      required: ["runId"],
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
  // The durable per-thread task journal. These are `implemented` — they have a
  // real handler (`apps/server/src/t3team-toolBrokerBindingTaskJournal.ts`) and
  // a real table (`thread_task_records`, migration t3team-056).
  "t3team.task.write": {
    id: "t3team.task.write",
    label: "Write task list",
    title: "Write this thread's task list",
    description:
      "Record this thread's plan as a task list that SURVIVES CONTEXT COMPACTION — it is stored outside the context window, so it is the one reliable place to keep what you are doing. This REPLACES the whole list every time: always send every task you still care about, not just the one that changed. Keep the list current — write it at the start, and rewrite it whenever a task's status changes. Mark exactly ONE task 'in_progress' at a time, so the list always says what you are doing right now. When something fails, do NOT drop the task: keep it and put the reason in its 'note' — that detail is exactly what compaction destroys. Order is the array order.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        tasks: {
          type: "array",
          description:
            "The COMPLETE task list, in order. Replaces whatever was stored before; omitting a task deletes it.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              subject: {
                type: "string",
                description: "Imperative form of the task, e.g. 'Add the migration'.",
                minLength: 1,
              },
              status: {
                type: "string",
                description:
                  "Task state. Defaults to 'pending'. Keep exactly one task 'in_progress'. Use 'cancelled' (not deletion) when you decide not to do it.",
                enum: ["pending", "in_progress", "completed", "cancelled"],
              },
              active_form: {
                type: "string",
                description:
                  "Optional present-participle form shown while the task runs, e.g. 'Adding the migration'.",
                minLength: 1,
              },
              note: {
                type: "string",
                description:
                  "Optional free text — record WHY a task failed, what you already ruled out, or what a child reported back. Keep failures here rather than dropping the task.",
                minLength: 1,
              },
            },
            required: ["subject"],
          },
        },
      },
      required: ["tasks"],
    },
  },
  "t3team.task.list": {
    id: "t3team.task.list",
    label: "Read task list",
    title: "Read this thread's task list",
    description:
      "Read back this thread's durable task list — your own plan, stored outside the context window. Call this after a compaction, or any time you are unsure what you were doing or what is left, INSTEAD of re-deriving it from the transcript or by polling your children. Takes no arguments. Returns each task with its 1-based position, subject, status, and any note.",
    capabilities: ["read"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: EMPTY_OBJECT_INPUT_SCHEMA,
  },
  "t3team.thread.search": {
    id: "t3team.thread.search",
    label: "Search this thread",
    title: "Search this thread's transcript",
    description:
      "Search the CURRENT thread — its messages AND its tool activity (commands and their output, file reads, tool calls) — e.g. to recover a decision, a requirement or a result that scrolled out of the context window. Compacted and truncated spans stay searchable. Pass a case-insensitive 'query' substring; a multi-word query that matches nothing verbatim is retried requiring every word (reported as matchMode). Newest matches come first unless 'order' is 'oldest'. Page with 'offset' when the result reports hasMore. Narrow with 'scope' or 'role'. Each match carries its 1-based position within its own stream, a snippet around the match, and either message_id (pass to t3team.thread.read_message for the full body) or activity_id. An activity records only the first 500 characters of a tool result. Optionally pass 'question' to get a direct answer ('why did that fail?', 'what did we decide about X?') instead of only locations: a bounded slice of the transcript is read by a fast model and the result adds 'answer', 'citations' and 'spanUsed'. Combine 'question' with 'query' (cheap default: the matches plus their immediate neighbours) or with 'fromPosition'/'toPosition' for an explicit span. If the model is unavailable the search results still come back, with 'answerError'.",
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
          description: "Case-insensitive substring to search for in this thread's transcript.",
          minLength: 1,
        },
        question: {
          type: "string",
          description:
            "Ask a question about this thread and get a direct answer instead of only match locations. Answered strictly from the selected transcript span.",
          minLength: 1,
        },
        fromPosition: {
          type: "number",
          description:
            "With 'question': start of an explicit transcript span (inclusive, 1-based position). An explicit span unlocks a much larger budget than the default.",
        },
        toPosition: {
          type: "number",
          description:
            "With 'question': end of an explicit transcript span (inclusive, 1-based position).",
        },
        limit: {
          type: "number",
          description: "Maximum number of matches to return (default 10, max 25).",
        },
        offset: {
          type: "number",
          description:
            "Skip this many matches before returning, in the requested order. Use the offset the previous result's hint reports when hasMore is true.",
        },
        scope: {
          type: "string",
          description:
            "Restrict the search to one stream: 'messages', 'activities' (tool calls and command output), or 'all' (default).",
          enum: ["all", "messages", "activities"],
        },
        order: {
          type: "string",
          description: "'recent' (default) returns the newest matches first; 'oldest' reverses it.",
          enum: ["recent", "oldest"],
        },
        role: {
          type: "string",
          description:
            "Optional filter on a message role ('user', 'assistant', 'actor') or an activity kind (e.g. 'bash'). An unknown value returns no matches.",
        },
      },
      // Either 'query' or 'question' is required; the handler enforces it,
      // because JSON Schema `required` cannot express the choice here.
      required: [],
    },
  },
  "t3team.thread.search_source": {
    id: "t3team.thread.search_source",
    label: "Search fork source thread",
    title: "Search the fork source thread",
    description:
      "Search the FULL transcript of the thread this thread was forked from — its messages and its tool activity — including the middle a truncated fork omitted. Only works in a forked thread. Pass a case-insensitive 'query' substring; a multi-word query that matches nothing verbatim is retried requiring every word (reported as matchMode). Newest matches come first unless 'order' is 'oldest'. Page with 'offset' when the result reports hasMore. Narrow with 'scope'. Each match carries its 1-based position within its own stream, a snippet around the match, and either message_id or activity_id.",
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
            "Case-insensitive substring to search for in the original thread's transcript.",
          minLength: 1,
        },
        limit: {
          type: "number",
          description: "Maximum number of matches to return (default 10, max 25).",
        },
        offset: {
          type: "number",
          description:
            "Skip this many matches before returning, in the requested order. Use the offset the previous result's hint reports when hasMore is true.",
        },
        scope: {
          type: "string",
          description:
            "Restrict the search to one stream: 'messages', 'activities' (tool calls and command output), or 'all' (default).",
          enum: ["all", "messages", "activities"],
        },
        order: {
          type: "string",
          description: "'recent' (default) returns the newest matches first; 'oldest' reverses it.",
          enum: ["recent", "oldest"],
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
  "t3team.thread.ask_user": {
    id: "t3team.thread.ask_user",
    label: "Ask user a question",
    title: "Ask the user a structured question",
    description:
      "Ask the user a structured question that docks in their composer and stays open until they answer or dismiss it — it survives the turn ending and session/app restarts. The tool returns immediately; the answer arrives in a later turn as a user message, so do not proceed as if answered and do not re-ask (the tool rejects a new ask while one is pending, naming the outstanding requestId). Field shape: 'header' is a short chip label (a few words); 'question' carries the full context plus the question itself and may use markdown; each option's 'description' explains what that choice means and its trade-off, never a restatement of its label; mark the recommended choice with '(recommended)' in its label. Works for any agent thread — in particular for harnesses whose model ships no native question tool.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: true,
    inputSchema: ASK_USER_INPUT_SCHEMA,
  },
  "t3team.thread.start_child": {
    id: "t3team.thread.start_child",
    label: "Start child session",
    title: "Start child session",
    description:
      "Create a child t3team session from the current thread and optionally start it immediately. isolation is required: 'shared' keeps the child in the project's shared checkout without repo_full_name; 'own-worktree' prepares a dedicated scoped worktree — of the linked repository named by repo_full_name when the project has linked repos, or of the local repository when it does not.",
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
