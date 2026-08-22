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
  t3team_search_source: "t3team.thread.search_source",
  t3team_start_child: "t3team.thread.start_child",
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
    "Create a child t3team session from the current thread. Use `effort` " +
    "('light' | 'standard' | 'high') to ask for a thinking tier WITHOUT naming a provider or " +
    "model — it is mapped onto whatever reasoning control the resolved provider exposes, and " +
    "is simply ignored by providers that expose none. Only reach for `provider`/`model`/" +
    "`reasoning_effort` when you genuinely need that exact target.",
  parameters: Schema.Struct({
    name: Schema.String,
    execution_scope: Schema.Literals(["metarepo", "repository"]),
    ticket_id: Schema.optional(Schema.String),
    kickoff_prompt: Schema.optional(Schema.String),
    kickoff_mode: Schema.optional(Schema.Literals(["plan", "interactive", "autopilot"])),
    // Optional provider instance id to run the child on a DIFFERENT provider than
    // the parent (e.g. spawn a Codex child from a Claude parent for cross-provider
    // review). Omit to inherit the parent's provider; `model` must be one of that
    // provider's models.
    provider: Schema.optional(Schema.String),
    model: Schema.optional(Schema.String),
    reasoning_effort: Schema.optional(Schema.Literals(["low", "medium", "high"])),
    // Provider-agnostic thinking tier — the same ladder workflow child turns use. Prefer this
    // over `reasoning_effort`, which needs the provider's own vocabulary. `reasoning_effort`
    // wins if both are given.
    effort: Schema.optional(Schema.Literals(["light", "standard", "high"])),
    repo_full_name: Schema.optional(Schema.String),
    repo_ref: Schema.optional(Schema.String),
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

// Cross-thread delivery: routes to the dedicated broker.sendMessage capability
// (not the bound-thread callTool dispatch), which records a first-class actor
// message and drives the recipient thread to react. The sender is the calling
// thread; the recipient reacts and can reply back the same way.
export const T3TeamSendMessageTool = Tool.make("t3team_send_message", {
  description:
    "Send a message to another agent's thread — e.g. report progress or results " +
    "back to your parent thread, or hand follow-up work to a child thread. The " +
    "recipient agent reacts to it automatically, so prefer this over waiting to be " +
    "polled. Address it with the target thread id.",
  parameters: Schema.Struct({
    to_thread_id: Schema.String,
    text: Schema.String,
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
  T3TeamSearchSourceTool,
  T3TeamStartChildTool,
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
