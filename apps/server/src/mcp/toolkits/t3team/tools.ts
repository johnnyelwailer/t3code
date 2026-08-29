/**
 * MCP wrappers for the existing t3team broker catalog. Broker behavior stays in
 * t3team-toolBrokerBindingDispatch.ts. Adding a host tool means adding it to that
 * dispatch/catalog once, then adding only a small static Tool.make wrapper here.
 */
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import { T3TEAM_WORKFLOW_TAGLINE } from "../../../t3team-workflowManual.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [McpInvocationContext.McpInvocationContext, T3TeamToolBroker];

/** Canonical broker tools exposed through provider-safe MCP names. Keep this registry beside
 * the toolkit; the parity test requires every implemented catalog tool to be mapped or named
 * in the explicit policy-exclusion set. */
export const T3TEAM_MCP_CANONICAL_TOOL_MAP = {
  t3team_rename_thread: "t3team.thread.rename",
  t3team_search_thread: "t3team.thread.search",
  t3team_search_source: "t3team.thread.search_source",
  t3team_read_message: "t3team.thread.read_message",
  t3team_start_child: "t3team.thread.start_child",
  t3team_children: "t3team.thread.children",
  t3team_orchestration_run: "t3team.orchestration.run",
  t3team_orchestration_status: "t3team.orchestration.status",
  t3team_orchestration_resume: "t3team.orchestration.resume",
  t3team_show_widget: "t3team.widget.show",
  t3team_recipe_list: "t3team.recipe.list",
  t3team_recipe_validate: "t3team.recipe.validate",
} as const;

/** Deprecated MCP tool name → its replacement. The old agent-orchestration names
 * (`t3team_workflow_*`) stay callable so pack configs, agent prompts, and live
 * transcripts that reference them keep working; both names dispatch to the same
 * canonical broker tool. */
export const T3TEAM_MCP_DEPRECATED_TOOL_ALIASES = {
  t3team_workflow_run: "t3team_orchestration_run",
  t3team_workflow_status: "t3team_orchestration_status",
  t3team_workflow_resume: "t3team_orchestration_resume",
} as const;

/**
 * Canonical tools deliberately NOT on the provider `/mcp` surface. The parity test forces an
 * explicit decision for every implemented catalog tool — mapped above, or listed here.
 *
 * The `draft_*` family is excluded for a structural reason, not convenience: those tools are
 * reachable only from a workflow body's `getTools()` tree (`t3team-workflowHostDraftTools.ts`),
 * and they are gated three ways — the body must declare the group in `meta.capabilities`, the id
 * must be in the thread's tool context, and the recipe's `allowedToolGroups` filters what
 * survives. Their `publishDraft` is also pinned to the launch thread so the draft carrier message
 * lands where the user can review it. Exposing them over `/mcp`, whose invocation scope carries
 * none of that, would bypass all three gates and unpin the target thread.
 */
export const T3TEAM_MCP_POLICY_EXCLUDED_CANONICAL_TOOLS: ReadonlySet<string> = new Set([
  "t3team.backlog.set_assignee_filter",
  "t3team.view.read",
  "t3team.work_item.refresh_context_bundle",
  "t3team.project.refresh_context_bundle",
  // Draft mutations — workflow-body surface only; see the note above.
  "t3team.backlog.item.assignee.draft_update",
  "t3team.backlog.item.estimate.draft_update",
  "t3team.backlog.item.subtask.draft_create",
  "t3team.work_item.assignee.draft_update",
  "t3team.work_item.estimate.draft_update",
  "t3team.work_item.status.draft_update",
  "t3team.work_item.description.draft_update",
  "t3team.work_item.comment.draft_create",
  "t3team.work_item.subtask.draft_create",
  "t3team.work_item.link.draft_create",
  "t3team.work_item.link.draft_remove",
]);

export class T3TeamMcpToolError extends Schema.TaggedErrorClass<T3TeamMcpToolError>()(
  "T3TeamMcpToolError",
  { message: Schema.String },
) {}

export const T3TeamRenameThreadTool = Tool.make("t3team_rename_thread", {
  description: "Rename the current t3team thread.",
  parameters: Schema.Struct({ title: Schema.String }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

export const T3TeamStartChildTool = Tool.make("t3team_start_child", {
  description:
    "Create a child t3team session from the current thread. `isolation` is required and decides where the child works: 'shared' runs it in the project's shared checkout (no new branch), 'own-worktree' gives it a dedicated branch + worktree — of the linked repo named by `repo_full_name`, or of the project's own repository when the project workspace IS a git repository (monorepo-as-metarepo) or a plain local workspace. Use `effort` " +
    "('light' | 'standard' | 'high') to ask for a thinking tier WITHOUT naming a provider or " +
    "model — it is mapped onto whatever reasoning control the resolved provider exposes, and " +
    "on providers that expose none it falls back to the model tier when the model slugs form " +
    "the effort ladder (light -> lowest rung, standard -> default/middle rung, high -> highest " +
    "rung); an effort that cannot be honored surfaces an effort_note in the launch result. " +
    "Only reach for `provider`/`model`/" +
    "`reasoning_effort` when you genuinely need that exact target.",
  parameters: Schema.Struct({
    name: Schema.String.annotate({
      description: "Name for the new child session.",
    }),
    isolation: Schema.Literals(["shared", "own-worktree"]).annotate({
      description:
        "Required. Where the child works: 'shared' = the project's shared checkout, no new branch or worktree (planning, triage, synthesis, read-only review); 'own-worktree' = a dedicated branch + worktree (implementation, debugging, tests, PR work). With 'own-worktree', pass 'repo_full_name' to pick a linked repo; omit it to isolate in the project's own repository (a monorepo used as the meta-repo, or a local workspace without linked repos).",
    }),
    ticket_id: Schema.optional(Schema.String).annotate({
      description:
        "Optional project ticket ID to attach the child session to. When this differs from the current ticket, the new session is attached directly under that ticket instead of nesting under the current thread.",
    }),
    kickoff_prompt: Schema.optional(Schema.String).annotate({
      description: "Optional first prompt sent to the child session.",
    }),
    kickoff_mode: Schema.optional(Schema.Literals(["plan", "interactive", "autopilot"])).annotate({
      description:
        "Optional kickoff style. 'plan' maps to plan mode; 'interactive' and 'autopilot' currently map to the default interaction mode.",
    }),
    // Optional provider instance id to run the child on a DIFFERENT provider than
    // the parent (e.g. spawn a Codex child from a Claude parent for cross-provider
    // review). Omit to inherit the parent's provider; `model` must be one of that
    // provider's models.
    provider: Schema.optional(Schema.String).annotate({
      description:
        "Optional provider instance id to run the child on a DIFFERENT provider than the parent (e.g. spawn a Codex child from a Claude parent for cross-provider review). Omit to inherit the parent's provider; `model` must be one of that provider's models.",
    }),
    model: Schema.optional(Schema.String).annotate({
      description:
        "Optional canonical model slug override for the child session. Prefer omitting this to inherit the current thread model; if you set it, use a provider-specific canonical slug such as 'gpt-5.4' or 'gpt-5.3-codex', not a generic alias like 'gpt-5'.",
    }),
    reasoning_effort: Schema.optional(Schema.Literals(["low", "medium", "high"])).annotate({
      description:
        "Optional PROVIDER-SPECIFIC reasoning effort override for the child session. Prefer the provider-agnostic 'effort' unless you need this exact value; 'reasoning_effort' wins when both are given.",
    }),
    // Provider-agnostic thinking tier — the same ladder workflow child turns use. Prefer this
    // over `reasoning_effort`, which needs the provider's own vocabulary. `reasoning_effort`
    // wins if both are given.
    effort: Schema.optional(Schema.Literals(["light", "standard", "high"])).annotate({
      description:
        "Optional provider-agnostic thinking tier for the child session. Ask for a tier without naming a provider or model: it is mapped onto whatever reasoning control the resolved provider/model exposes, and is ignored when it exposes none.",
    }),
    repo_full_name: Schema.optional(Schema.String).annotate({
      description:
        "Optional, only with isolation='own-worktree'. Linked repository to open in a fresh scoped worktree, for example 'owner/repo' or 'github.com/owner/repo'. Required in legacy projects that wrap linked repos. In a monorepo project (workspace is itself a git repository used as the meta-repo) you may pass the meta-repo's own URL to isolate there explicitly, or omit it; in a local workspace (no linked repos) omit it to isolate in the local repository.",
    }),
    repo_ref: Schema.optional(Schema.String).annotate({
      description:
        "Optional branch, tag, or commit to use as the base ref for the child's worktree (linked or local). Only valid with isolation='own-worktree'. When omitted, the repository default branch is used.",
    }),
  }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Child-thread management: ONE meta tool with an `op` discriminator (list /
// status / wait / watch / unwatch / stop / close / sweep / help) instead of a tool
// per operation, so the context cost stays one compact description no matter
// how many ops exist. Per-op detail is discovered on demand via `help` or
// carried in a malformed call's error message. Routes to the t3team.thread.
// children broker tool. This tool is STATE (child liveness / completion);
// child→parent CONTENT still flows through t3team_send_message.
const CHILDREN_TOOL_DESCRIPTION =
  "Manage this thread's child sessions (STATE, not content — use send_message to talk to a " +
  "child). One tool; `op` selects the operation:\n" +
  "- list: this thread's children with live state (all:true = whole project; " +
  "include_settled:true lists settled children too — they are excluded by default)\n" +
  "- status: one thread's current turn state, in-progress work, elapsed\n" +
  "- wait: durably resume this turn when a child reaches a terminal state (on: " +
  "terminal|completed|failed; timeout in ms)\n" +
  "- watch: silence-watch a thread — this thread is notified when the target has had no " +
  "activity for `timeout` ms (default 900000; per-subscription), re-notified at each multiple " +
  "while it stays silent; the note flags a pending tool call (legitimate long op) vs. no " +
  "active tool (the stuck signal)\n" +
  "- unwatch: cancel all silence watches on the target\n" +
  "- stop: halt a child's running turn\n" +
  "- close: mark a child done from this side\n" +
  "- sweep: settle terminal (completed/failed/aborted) threads in bulk — given thread ids " +
  "and/or all of this thread's terminal children older than N hours. Cleanup protocol: verify " +
  "each state first (final result / discarded work / unpushed work in worktrees), then sweep; " +
  "settled threads keep their transcripts and drop out of the active rosters\n" +
  "- help: exact schema for one op (op_name)";

export const T3TeamChildrenTool = Tool.make("t3team_children", {
  description: CHILDREN_TOOL_DESCRIPTION,
  parameters: Schema.Struct({
    op: Schema.Literals([
      "list",
      "status",
      "wait",
      "watch",
      "unwatch",
      "stop",
      "close",
      "sweep",
      "help",
    ]),
    thread_id: Schema.optional(Schema.String),
    thread_ids: Schema.optional(Schema.Array(Schema.String)),
    on: Schema.optional(Schema.Literals(["terminal", "completed", "failed"])),
    timeout: Schema.optional(Schema.Number),
    all: Schema.optional(Schema.Boolean),
    all_older_than_hours: Schema.optional(Schema.Number),
    include_settled: Schema.optional(Schema.Boolean),
    reason: Schema.optional(Schema.String),
    op_name: Schema.optional(Schema.String),
  }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Search the CURRENT thread's transcript (case-insensitive substring). Read-only;
// routes to the t3team.thread.search broker tool. Complements t3team_search_source
// (fork source) and t3team_read_message (full body by message id).
export const T3TeamSearchThreadTool = Tool.make("t3team_search_thread", {
  description:
    "Search the messages of the CURRENT thread (its own transcript) — e.g. to recover a " +
    "prior decision or context that scrolled out of the context window. Pass a " +
    "case-insensitive 'query' substring and an optional 'limit' (default 10, max 25). " +
    "Returns matching messages with their 1-based position, role, a snippet, and message_id " +
    "(pass message_id to t3team_read_message to fetch the full body).",
  parameters: Schema.Struct({
    query: Schema.String,
    limit: Schema.optional(Schema.Number),
    role: Schema.optional(Schema.Literals(["user", "assistant", "actor"])),
  }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Search the full transcript of the thread this one was forked from (the fork
// provenance note identifies the source). Read-only; routes to the
// t3team.thread.search_source broker tool.
export const T3TeamSearchSourceTool = Tool.make("t3team_search_source", {
  description:
    "Search the FULL transcript of the thread this thread was forked from, including the " +
    "middle messages a truncated fork omitted. Only works in a forked thread. Pass a " +
    "case-insensitive 'query' substring and an optional 'limit' (default 10, max 25). " +
    "Returns matching messages with their 1-based position, role, and a snippet.",
  parameters: Schema.Struct({
    query: Schema.String,
    limit: Schema.optional(Schema.Number),
  }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Read the full body of a previously delivered inter-agent message. Long
// inter-agent bodies are summarized on delivery; the summary marker carries
// the message id, which this tool takes. Read-only; routes to the
// t3team.thread.read_message broker tool.
export const T3TeamReadMessageTool = Tool.make("t3team_read_message", {
  description:
    "Read the FULL body of a previously delivered inter-agent message in this thread. Long " +
    "inter-agent message bodies are summarized on delivery; the marker in the delivered " +
    "summary carries the message id. Pass that 'message_id' to retrieve the full " +
    "persisted text.",
  parameters: Schema.Struct({
    message_id: Schema.String,
  }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Cross-thread delivery: routes to the dedicated broker.sendMessage capability
// (not the bound-thread callTool dispatch), which records a first-class actor
// message and drives the recipient thread to react. The sender is the calling
// thread; the recipient reacts and can reply back the same way.
export const T3TeamSendMessageTool = Tool.make("t3team_send_message", {
  description:
    "Send a message to another agent's thread. Use ONLY when you have content the " +
    "recipient does not already have and can act on: a final result for your parent, " +
    "a follow-up task or handoff for a child, or a question/command directed at the " +
    "recipient. NEVER send acknowledgment, thanks, status-only, or 'noted/received' " +
    "messages — if your reply would not change what the recipient does, do not send " +
    "it. The recipient reacts to every message automatically, so an ack triggers " +
    "another turn on the other side. Address it with the target thread id. Keep the " +
    "body short (telegram " +
    "style: state, decision, request). For long bodies, provide a short 'summary' " +
    "(the recipient's reaction input shows the summary, not a raw cut); without " +
    "one, a summary is auto-generated from the body's opening. The recipient " +
    "retrieves the full text with t3team_read_message.",
  parameters: Schema.Struct({
    to_thread_id: Schema.String,
    text: Schema.String,
    summary: Schema.optional(Schema.String),
  }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Ephemeral agent orchestration: run a short multi-step structure immediately in
// this conversation, defined inline via `source` (persisted per-run, no approval
// gate). Routes to the t3team.orchestration.run broker tool. Prefer this over
// walking multi-step tasks by hand; on a `failed` status, fix the source and run
// again.
const orchestrationRunParameters = Schema.Struct({
  source: Schema.optional(Schema.String),
  workflowPath: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Unknown),
  intent: Schema.Struct({
    goal: Schema.String,
    expectedOutcome: Schema.String,
    guardrails: Schema.Array(Schema.String),
  }),
});

const orchestrationRunDescription =
  `${T3TEAM_WORKFLOW_TAGLINE} Pass \`source\` (the orchestration body — MUST be orchestration ` +
  "TypeScript starting with `export const meta = {...}`, NEVER YAML or JSON) or `workflowPath` " +
  "(an existing `.workflow.ts`), required `intent` ({goal, expectedOutcome, guardrails}), and " +
  "optional `args`. Returns {runId, status: accepted|completed|suspended|failed, " +
  "handoff: 'workflow-ui', output?, error?}. After a successful handoff, end the current turn " +
  "with no assistant prose; the orchestration card owns progress and user decisions.";

export const T3TeamOrchestrationRunTool = Tool.make("t3team_orchestration_run", {
  description: orchestrationRunDescription,
  parameters: orchestrationRunParameters,
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Read-only observability for a run launched via t3team_orchestration_run: what
// it's doing now and what (if anything) to do next. Routes to the
// t3team.orchestration.status broker tool. Prefer this over guessing from silence
// after a handoff.
const orchestrationStatusDescription =
  "Observe an agent-orchestration run: status, what it's waiting on, and next-step hint. Omit " +
  "runId to list recent runs.";
const orchestrationStatusParameters = Schema.Struct({ runId: Schema.optional(Schema.String) });

export const T3TeamOrchestrationStatusTool = Tool.make("t3team_orchestration_status", {
  description: orchestrationStatusDescription,
  parameters: orchestrationStatusParameters,
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Resume a paused/failed orchestration run from its durable journal (same-prefix
// replay: journaled steps return their recorded results; execution continues live
// past the recorded frontier). Routes to the t3team.orchestration.resume broker
// tool. Prefer this over re-running from scratch when the executed prefix should
// be kept.
const orchestrationResumeDescription =
  "Resume a paused or failed agent-orchestration run from its journal. Pass the `runId` from " +
  "t3team_orchestration_run/t3team_orchestration_status; optionally pass corrected `source` for " +
  "an ephemeral run (same-prefix replay — do not change already-executed steps). Returns " +
  "{runId, status: accepted|suspended|sleeping, hint}; observe progress via " +
  "t3team_orchestration_status.";
const orchestrationResumeParameters = Schema.Struct({
  runId: Schema.String,
  source: Schema.optional(Schema.String),
});

export const T3TeamOrchestrationResumeTool = Tool.make("t3team_orchestration_resume", {
  description: orchestrationResumeDescription,
  parameters: orchestrationResumeParameters,
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Deprecated aliases (see T3TEAM_MCP_DEPRECATED_TOOL_ALIASES): identical schemas,
// same canonical broker target. Kept so existing pack configs and agent prompts
// that name `t3team_workflow_*` do not silently lose the capability.
const deprecated = (replacement: string) =>
  `DEPRECATED alias for ${replacement} — use that name instead. `;

export const T3TeamWorkflowRunTool = Tool.make("t3team_workflow_run", {
  description: deprecated("t3team_orchestration_run") + orchestrationRunDescription,
  parameters: orchestrationRunParameters,
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

export const T3TeamWorkflowStatusTool = Tool.make("t3team_workflow_status", {
  description: deprecated("t3team_orchestration_status") + orchestrationStatusDescription,
  parameters: orchestrationStatusParameters,
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

export const T3TeamWorkflowResumeTool = Tool.make("t3team_workflow_resume", {
  description: deprecated("t3team_orchestration_resume") + orchestrationResumeDescription,
  parameters: orchestrationResumeParameters,
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Render an inline, sandboxed HTML/SVG widget in the calling thread. This is a
// current-thread operation: the handler deliberately goes through the bound
// broker surface, so normal thread resolution and tool-group policy still apply.
export const T3TeamShowWidgetTool = Tool.make("t3team_show_widget", {
  description:
    "Show an inline widget in the current t3team thread. Use a small HTML or SVG fragment " +
    "(not a complete document). The optional capabilities.tools allowlist controls which " +
    "t3team broker tools the widget may call.",
  parameters: Schema.Struct({
    title: Schema.String,
    widget_code: Schema.String,
    format: Schema.optional(Schema.Literals(["html", "svg"])),
    loading_messages: Schema.optional(Schema.Array(Schema.String)),
    capabilities: Schema.optional(
      Schema.Struct({ tools: Schema.optional(Schema.Array(Schema.String)) }),
    ),
  }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// On-demand reference docs — one generic tool for any topic (see t3team-help.ts),
// so tool descriptions stay lean and agents discover detail proactively.
export const T3TeamHelpTool = Tool.make("t3team_help", {
  description:
    'Get t3team reference docs on demand. Pass a topic slug (e.g. "agent-orchestration" for ' +
    "how to author a t3team_orchestration_run body); omit `topic` to list available topics.",
  parameters: Schema.Struct({ topic: Schema.optional(Schema.String) }),
  success: Schema.String,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Read-only listing of the project's saved recipe workflows. Routes to the
// t3team.recipe.list broker tool. This tool takes no arguments; declared via
// Tool.dynamic with an explicit `{type:"object"}` JSON schema because an effect
// `Schema.Struct({})` renders as `{anyOf:[{object},{array}]}` (an empty TS object
// type means "any non-null"), and MCP clients reject a non-object tool inputSchema
// on tools/list — which would take the whole toolkit down for that client.
// `Tool.make`, not `Tool.dynamic`: a dynamic tool cannot declare `dependencies`, so its
// handler is required to be `Effect<…, …, never>`. This one dispatches through the broker
// like every sibling, so it needs `McpInvocationContext` + `T3TeamToolBroker` in scope —
// as `Tool.dynamic` that was a type error (R was `T3TeamToolBroker | McpInvocationContext`,
// expected `never`). It takes no arguments, which `Schema.Struct({})` expresses.
export const T3TeamRecipeListTool = Tool.make("t3team_recipe_list", {
  description:
    "List every saved recipe orchestration you can run — both the project's own and the ones " +
    "shipped by installed packs. Each entry carries {id, title, recipePath, workflowPath?, " +
    'source} where source is "project-local" or "pack"; pass recipePath to run or validate ' +
    "it. Prefer an existing recipe over re-authoring one. Read-only.",
  // `parameters` is OMITTED, not `Schema.Struct({})`. An empty TS object type means "any
  // non-null", so effect renders that struct as `{anyOf:[{object},{array}]}` — and MCP clients
  // reject a non-object tool inputSchema on tools/list, which drops the WHOLE t3team toolkit for
  // that client, not just this tool. Omitting it picks up `Tool.EmptyParams`, which renders as
  // `{type:"object",additionalProperties:false}`. Guarded by t3team-mcpToolInputSchema.test.ts.
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Static, read-only validation of an orchestration before running it — either an
// existing on-disk recipe (`path`) or inline source (`source`, the same body
// passed to t3team_orchestration_run). Routes to the t3team.recipe.validate
// broker tool; never writes or executes anything.
export const T3TeamRecipeValidateTool = Tool.make("t3team_recipe_validate", {
  description:
    "Statically validate an agent orchestration before running it: pass `source` (inline " +
    "orchestration TypeScript — same body you would pass to t3team_orchestration_run) or `path` " +
    "(a .workflow.ts or recipe directory in the workspace). Returns {ok, meta?, shape?, " +
    "errors[]}; fix errors and re-validate until ok before calling t3team_orchestration_run. " +
    "Nothing is executed or written.",
  parameters: Schema.Struct({
    path: Schema.optional(Schema.String),
    source: Schema.optional(Schema.String),
  }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

export const T3TeamToolkit = Toolkit.make(
  T3TeamRenameThreadTool,
  T3TeamSearchThreadTool,
  T3TeamSearchSourceTool,
  T3TeamReadMessageTool,
  T3TeamStartChildTool,
  T3TeamChildrenTool,
  T3TeamSendMessageTool,
  T3TeamOrchestrationRunTool,
  T3TeamOrchestrationStatusTool,
  T3TeamOrchestrationResumeTool,
  T3TeamWorkflowRunTool,
  T3TeamWorkflowStatusTool,
  T3TeamWorkflowResumeTool,
  T3TeamShowWidgetTool,
  T3TeamHelpTool,
  T3TeamRecipeListTool,
  T3TeamRecipeValidateTool,
);
