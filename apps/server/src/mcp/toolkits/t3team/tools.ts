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
  t3team_start_child: "t3team.thread.start_child",
  t3team_workflow_run: "t3team.workflow.run",
  t3team_workflow_status: "t3team.workflow.status",
  t3team_show_widget: "t3team.widget.show",
  t3team_recipe_list: "t3team.recipe.list",
  t3team_recipe_validate: "t3team.recipe.validate",
} as const;

export const T3TEAM_MCP_POLICY_EXCLUDED_CANONICAL_TOOLS: ReadonlySet<string> = new Set([
  "t3team.backlog.set_assignee_filter",
  "t3team.view.read",
  "t3team.work_item.refresh_context_bundle",
  "t3team.project.refresh_context_bundle",
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
  description: "Create a child t3team session from the current thread.",
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
    repo_full_name: Schema.optional(Schema.String),
    repo_ref: Schema.optional(Schema.String),
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

// Ephemeral "runbook": run a short multi-step workflow immediately in this
// conversation, defined inline via `source` (persisted per-run, no approval
// gate). Routes to the existing t3team.workflow.run broker tool. Prefer this
// over walking multi-step tasks by hand; on a `failed` status, fix the source
// and run again.
export const T3TeamWorkflowRunTool = Tool.make("t3team_workflow_run", {
  description:
    `${T3TEAM_WORKFLOW_TAGLINE} Pass \`source\` (the orchestration body — MUST be workflow ` +
    "TypeScript starting with `export const meta = {...}`, NEVER YAML or JSON) or `workflowPath`, " +
    "required `intent` ({goal, expectedOutcome, guardrails}), and optional `args`. Returns " +
    "{runId, status: accepted|completed|suspended|failed, handoff: 'workflow-ui', output?, error?}. " +
    "After a successful workflow-ui handoff, end the current turn with no assistant prose; " +
    "the workflow card owns progress and user decisions.",
  parameters: Schema.Struct({
    source: Schema.optional(Schema.String),
    workflowPath: Schema.optional(Schema.String),
    args: Schema.optional(Schema.Unknown),
    intent: Schema.Struct({
      goal: Schema.String,
      expectedOutcome: Schema.String,
      guardrails: Schema.Array(Schema.String),
    }),
  }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Read-only observability for a run launched via t3team_workflow_run: what it's
// doing now and what (if anything) to do next. Routes to the t3team.workflow.status
// broker tool. Prefer this over guessing from silence after a workflow-ui handoff.
export const T3TeamWorkflowStatusTool = Tool.make("t3team_workflow_status", {
  description:
    "Observe a workflow run: status, what it's waiting on, and next-step hint. Omit runId to " +
    "list recent runs.",
  parameters: Schema.Struct({ runId: Schema.optional(Schema.String) }),
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
    "how to author a t3team_workflow_run body); omit `topic` to list available topics.",
  parameters: Schema.Struct({ topic: Schema.optional(Schema.String) }),
  success: Schema.String,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Read-only listing of the project's saved recipe workflows. Routes to the
// t3team.recipe.list broker tool. This tool takes no arguments, so it omits
// `parameters` entirely and picks up Tool.EmptyParams (a `Record<string, never>`),
// which `Tool.getJsonSchema` renders as `{type:"object",additionalProperties:false}`.
// Do NOT reach for `Schema.Struct({})`: that renders as `{anyOf:[{object},{array}]}`
// (an empty TS object type means "any non-null") and MCP clients reject a non-object
// tool inputSchema on tools/list, which would take the whole toolkit down for that
// client. Tool.dynamic would also render a valid object schema, but it accepts no
// `dependencies` and types its handler context as `never`, so the handler could not
// reach McpInvocationContext / T3TeamToolBroker to call the broker.
export const T3TeamRecipeListTool = Tool.make("t3team_recipe_list", {
  description: "List the project's saved recipe workflows (id, title, paths). Read-only.",
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

// Static, read-only validation of a workflow before running it — either an
// existing on-disk recipe (`path`) or inline source (`source`, the same body
// passed to t3team_workflow_run). Routes to the t3team.recipe.validate broker
// tool; never writes or executes anything.
export const T3TeamRecipeValidateTool = Tool.make("t3team_recipe_validate", {
  description:
    "Statically validate a workflow before running it: pass `source` (inline workflow " +
    "TypeScript — same body you would pass to t3team_workflow_run) or `path` (a .workflow.ts " +
    "or recipe directory in the workspace). Returns {ok, meta?, shape?, errors[]}; fix errors " +
    "and re-validate until ok before calling t3team_workflow_run. Nothing is executed or written.",
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
  T3TeamStartChildTool,
  T3TeamSendMessageTool,
  T3TeamWorkflowRunTool,
  T3TeamWorkflowStatusTool,
  T3TeamShowWidgetTool,
  T3TeamHelpTool,
  T3TeamRecipeListTool,
  T3TeamRecipeValidateTool,
);
