import { PROJECT_STATE_DIR } from "./t3teamProjectStateDir.ts";
import { EMPTY_OBJECT_INPUT_SCHEMA, type T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";
import {
  T3TEAM_WIDGET_AUTHORING_GUIDANCE,
  T3TEAM_WIDGET_FORMAT_DESCRIPTION,
  T3TEAM_WIDGET_INTENT_DESCRIPTION,
  T3TEAM_WIDGET_SHOW_TOOL_DESCRIPTION,
} from "./t3teamWidgetGuidance.ts";

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
    intent: {
      type: "string",
      description: T3TEAM_WIDGET_INTENT_DESCRIPTION,
    },
    widget_code: {
      type: "string",
      description: T3TEAM_WIDGET_AUTHORING_GUIDANCE,
    },
    format: {
      type: "string",
      enum: ["html", "svg"],
      description: T3TEAM_WIDGET_FORMAT_DESCRIPTION,
    },
    loading_messages: {
      type: "array",
      items: { type: "string" },
    },
    capabilities: {
      type: "object",
      additionalProperties: false,
      properties: {
        tools: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
  required: ["title"],
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
    context: {
      type: "string",
      description:
        "Markdown from earlier in the thread that the question refers to; rendered above the question. Pass it whenever the question does not stand on its own.",
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
                description:
                  "What this choice means and its trade-off — never a restatement of the label.",
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
  "t3team.runtime.provider_usage": {
    id: "t3team.runtime.provider_usage",
    label: "Read provider usage limits",
    title: "Read provider usage-limit windows per instance",
    description:
      "Read each provider INSTANCE's usage-limit windows (session / weekly / monthly: usedPercent, resetsAt, severity normal|warning|critical) from the host's live provider snapshots, plus accounts reported by configured usage hubs. Call it when you need to know how close an account is to its limit before delegating long work to it, or when a turn failed with a usage-limit error. Instances without data say why in `unavailable` instead of failing the call.",
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
            "Optional provider INSTANCE id (as listed by orchestrator_capabilities). Omit to list every enabled instance and hub account.",
        },
      },
    },
  },
  "t3team.widget.show": {
    id: "t3team.widget.show",
    label: "Show widget",
    title: "Show an inline widget in the chat timeline",
    description: T3TEAM_WIDGET_SHOW_TOOL_DESCRIPTION,
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
    description: `List the t3team project recipes discovered in this project's workspace (${PROJECT_STATE_DIR}/recipes/) — t3team project recipes are directories bundling a typed recipe.ts module (or legacy recipe.json manifest) with a .workflow.ts the t3team workflow engine runs; they are NOT Claude Code skills or provider-native workflows. Returns each recipe's id, title, shortDescription, surfaces, authoring form ('recipe-ts' typed module vs 'recipe-json' legacy manifest), recipe directory, and resolved workflow path, plus structured errors for recipes that failed to load. Read-only: nothing is written or launched.`,
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
      "Statically validate an agent orchestration before running it: pass 'source' (inline " +
      "orchestration TypeScript, the body you would pass to t3team.orchestration.run) or 'path' " +
      "(a .workflow.ts or recipe directory in the workspace). Runs the full launch check: format, " +
      "determinism, runtime bindings, capabilities, TypeScript types and model slugs. Returns " +
      "{ok, errors[], meta?, shape?}; fix every error and validate again until ok. Nothing is " +
      "executed or written. These are t3team orchestrations, not Claude Code skills or CI workflows.",
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
            "Optional. A .workflow.ts file or recipe directory, relative to the project workspace root (absolute paths must stay inside the workspace).",
          minLength: 1,
        },
        source: {
          type: "string",
          description:
            "Optional. Inline orchestration TypeScript to validate; pass this or 'path'.",
          minLength: 1,
        },
      },
    },
  },
  "t3team.orchestration.run": {
    id: "t3team.orchestration.run",
    label: "Run ephemeral orchestration",
    title: "Run a temporary agent orchestration in this conversation",
    description:
      "Agent orchestration: a durable, journaled multi-agent run (parallel or sequential agents, " +
      "result contracts, durable timers, user decisions); NOT a CI or Claude Code/Codex workflow. " +
      "Use it for complex or long work; do a simple single-agent task directly. If a saved recipe " +
      "fits (t3team.recipe.list), pass 'recipe' (and optional 'action'). Otherwise pass 'intent' " +
      "(a goal string, or {goal, expectedOutcome, guardrails}; constraints such as which model to " +
      "use go here in plain language) and optional 'args': a host author agent writes, validates " +
      "and launches the source. 'workflowPath' runs an existing .workflow.ts from your checkout " +
      "as-is. Returns {runId, status, hint} immediately. status 'authoring' means NOTHING runs " +
      "yet: never tell the user it is running; follow 'hint' and end your turn. The run card " +
      "shows authoring, then running, then the result; t3team.orchestration.status reports the " +
      "live state. One launch per turn: while a run this thread launched is active a second call " +
      "is refused; pass 'replaceRunId' to stop it and launch the replacement. At most 8 live runs.",
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
            "Orchestration TypeScript. A run's author submits its validated source here; from any other thread it is a draft the author starts from.",
          minLength: 1,
        },
        workflowPath: {
          type: "string",
          description:
            "Optional. An existing .workflow.ts to run as-is: relative to your checkout (or the project root), and inside one of them. Omit to have the orchestration authored from intent.",
          minLength: 1,
        },
        recipe: {
          type: "string",
          description:
            "A recipe id from the recipe list; the project's own recipe wins over a pack's. Runs it with its scripts and tool scope.",
          minLength: 1,
        },
        action: {
          type: "string",
          description: "The recipe action to run with 'recipe'; omit for its default action.",
          minLength: 1,
        },
        args: {
          description: "Launch arguments decoded by the orchestration's meta.inputs schema.",
        },
        intent: {
          description:
            "The run's contract: a goal string, or {goal, expectedOutcome?, guardrails?}. Needed unless you pass source, workflowPath or recipe. Plain-language constraints (provider/model, scope) belong here.",
          anyOf: [
            { type: "string", minLength: 1 },
            {
              type: "object",
              properties: {
                goal: { type: "string", minLength: 1 },
                expectedOutcome: { type: "string" },
                guardrails: { type: "array", items: { type: "string" } },
              },
              required: ["goal"],
            },
          ],
        },
        replaceRunId: {
          type: "string",
          description:
            "A still-active run this thread launched; it is stopped before the new one launches.",
          minLength: 1,
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
      "(authoring = the source is still being written, nothing runs yet; queued; running; " +
      "suspended/sleeping/watching = parked on an ask, timer or event; paused; completed; failed; " +
      "cancelled), what it is waiting on, and a one-sentence " +
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
      "t3team.orchestration.run or t3team.orchestration.status. Scoped to the calling thread's " +
      "own runs. Returns {runId, status: accepted|suspended|sleeping, hint}; observe progress " +
      'via t3team.orchestration.status. Reading a failure: "Invalid inputs for workflow" means ' +
      "the launch args were wrong — resume the same runId with corrected 'args' (never a new " +
      'run); "The agent turn failed" means a step\'s provider turn died — resume the same runId ' +
      "and it re-drives that step; anything else is a source defect the run's author handles — " +
      "resume only once the card offers it (an ephemeral run also accepts corrected 'source').",
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
        args: {
          description:
            "Optional corrected launch args for a run that failed its meta.inputs decode; the " +
            "same run re-drives with them.",
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
      "Search the FULL transcript of the thread this thread was forked from — its messages and its tool activity — including details the fork's compacted handoff left out. Only works in a forked thread. Pass a case-insensitive 'query' substring; a multi-word query that matches nothing verbatim is retried requiring every word (reported as matchMode). Newest matches come first unless 'order' is 'oldest'. Page with 'offset' when the result reports hasMore. Narrow with 'scope'. Each match carries its 1-based position within its own stream, a snippet around the match, and either message_id or activity_id.",
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
      "Read the FULL body of a previously delivered inter-agent message (sent with t3_thread_send mode 'mailbox') in this thread. Long inter-agent bodies are truncated on delivery; the truncation marker in the delivered preview carries the message id. Pass that 'message_id' to retrieve the full persisted text.",
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
  "t3team.thread.children": {
    id: "t3team.thread.children",
    label: "Child-thread operations",
    title: "Child-thread operations beyond delegate_task",
    description:
      "Child-thread operations beyond delegate_task / task_status / task_cancel / t3_thread_*. One tool; `op` selects the operation:\n" +
      "- watch: silence-watch a thread (notified when it has no activity for timeout ms; default 15 minutes)\n" +
      "- unwatch: cancel this thread's silence watches on the target\n" +
      "- sweep: settle finished threads in bulk (thread_ids and/or this thread's children older than all_older_than_hours); verify each first\n" +
      "- drain: claim this thread's own pending inter-agent mailbox now (no arguments)\n" +
      "- environments: read-only — which environments delegate_task's extensions.environment can target (every entry states its delivery boundary)\n" +
      "- help: exact usage for one op (op_name)",
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
          description:
            "The operation to perform: watch, unwatch, sweep, drain, environments, or help.",
          enum: ["watch", "unwatch", "sweep", "drain", "environments", "help"],
        },
        thread_id: {
          type: "string",
          description: "Target thread id. Required for watch and unwatch.",
          minLength: 1,
        },
        thread_ids: {
          type: "array",
          description: "For sweep: explicit thread ids to settle.",
          items: { type: "string", minLength: 1 },
        },
        timeout: {
          type: "number",
          description: "For watch: silence timeout in milliseconds.",
        },
        all_older_than_hours: {
          type: "number",
          description: "For sweep: also settle this thread's finished children older than N hours.",
        },
        op_name: {
          type: "string",
          description: "For help: which op's usage to return. Omit for all ops.",
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
