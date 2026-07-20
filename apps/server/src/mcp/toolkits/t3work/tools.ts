/**
 * MCP wrappers for the existing t3work broker catalog. Broker behavior stays in
 * t3work-toolBrokerBindingDispatch.ts. Adding a host tool means adding it to that
 * dispatch/catalog once, then adding only a small static Tool.make wrapper here.
 */
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { T3workToolBroker } from "../../../t3work-toolBroker.ts";
import { T3WORK_WORKFLOW_TAGLINE } from "../../../t3work-workflowManual.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [McpInvocationContext.McpInvocationContext, T3workToolBroker];

/** Canonical broker tools exposed through provider-safe MCP names. Keep this registry beside
 * the toolkit; the parity test requires every implemented catalog tool to be mapped or named
 * in the explicit policy-exclusion set. */
export const T3WORK_MCP_CANONICAL_TOOL_MAP = {
  t3work_rename_thread: "t3work.thread.rename",
  t3work_start_child: "t3work.thread.start_child",
  t3work_workflow_run: "t3work.workflow.run",
  t3work_workflow_status: "t3work.workflow.status",
  t3work_show_widget: "t3work.widget.show",
} as const;

export const T3WORK_MCP_POLICY_EXCLUDED_CANONICAL_TOOLS: ReadonlySet<string> = new Set([
  "t3work.backlog.set_assignee_filter",
  "t3work.view.read",
  "t3work.recipe.list",
  "t3work.recipe.validate",
  "t3work.work_item.refresh_context_bundle",
  "t3work.project.refresh_context_bundle",
]);

export class T3workMcpToolError extends Schema.TaggedErrorClass<T3workMcpToolError>()(
  "T3workMcpToolError",
  { message: Schema.String },
) {}

export const T3workRenameThreadTool = Tool.make("t3work_rename_thread", {
  description: "Rename the current t3work thread.",
  parameters: Schema.Struct({ title: Schema.String }),
  success: Schema.Unknown,
  failure: T3workMcpToolError,
  dependencies,
});

export const T3workStartChildTool = Tool.make("t3work_start_child", {
  description: "Create a child t3work session from the current thread.",
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
  failure: T3workMcpToolError,
  dependencies,
});

// Cross-thread delivery: routes to the dedicated broker.sendMessage capability
// (not the bound-thread callTool dispatch), which records a first-class actor
// message and drives the recipient thread to react. The sender is the calling
// thread; the recipient reacts and can reply back the same way.
export const T3workSendMessageTool = Tool.make("t3work_send_message", {
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
  failure: T3workMcpToolError,
  dependencies,
});

// Ephemeral "runbook": run a short multi-step workflow immediately in this
// conversation, defined inline via `source` (persisted per-run, no approval
// gate). Routes to the existing t3work.workflow.run broker tool. Prefer this
// over walking multi-step tasks by hand; on a `failed` status, fix the source
// and run again.
export const T3workWorkflowRunTool = Tool.make("t3work_workflow_run", {
  description:
    `${T3WORK_WORKFLOW_TAGLINE} Pass \`source\` (the orchestration body — MUST be workflow ` +
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
  failure: T3workMcpToolError,
  dependencies,
});

// Read-only observability for a run launched via t3work_workflow_run: what it's
// doing now and what (if anything) to do next. Routes to the t3work.workflow.status
// broker tool. Prefer this over guessing from silence after a workflow-ui handoff.
export const T3workWorkflowStatusTool = Tool.make("t3work_workflow_status", {
  description:
    "Observe a workflow run: status, what it's waiting on, and next-step hint. Omit runId to " +
    "list recent runs.",
  parameters: Schema.Struct({ runId: Schema.optional(Schema.String) }),
  success: Schema.Unknown,
  failure: T3workMcpToolError,
  dependencies,
});

// Render an inline, sandboxed HTML/SVG widget in the calling thread. This is a
// current-thread operation: the handler deliberately goes through the bound
// broker surface, so normal thread resolution and tool-group policy still apply.
export const T3workShowWidgetTool = Tool.make("t3work_show_widget", {
  description:
    "Show an inline widget in the current t3work thread. Use a small HTML or SVG fragment " +
    "(not a complete document). The optional capabilities.tools allowlist controls which " +
    "t3work broker tools the widget may call.",
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
  failure: T3workMcpToolError,
  dependencies,
});

// On-demand reference docs — one generic tool for any topic (see t3work-help.ts),
// so tool descriptions stay lean and agents discover detail proactively.
export const T3workHelpTool = Tool.make("t3work_help", {
  description:
    'Get t3work reference docs on demand. Pass a topic slug (e.g. "agent-orchestration" for ' +
    "how to author a t3work_workflow_run body); omit `topic` to list available topics.",
  parameters: Schema.Struct({ topic: Schema.optional(Schema.String) }),
  success: Schema.String,
  failure: T3workMcpToolError,
  dependencies,
});

export const T3workToolkit = Toolkit.make(
  T3workRenameThreadTool,
  T3workStartChildTool,
  T3workSendMessageTool,
  T3workWorkflowRunTool,
  T3workWorkflowStatusTool,
  T3workShowWidgetTool,
  T3workHelpTool,
);
