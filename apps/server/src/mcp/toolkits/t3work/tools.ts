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
    `${T3WORK_WORKFLOW_TAGLINE} Pass \`source\` (the orchestration body) or \`workflowPath\`, ` +
    "plus optional `args`. Returns {runId, status: completed|suspended|failed, output?, error?}.",
  parameters: Schema.Struct({
    source: Schema.optional(Schema.String),
    workflowPath: Schema.optional(Schema.String),
    args: Schema.optional(Schema.Unknown),
  }),
  success: Schema.Unknown,
  failure: T3workMcpToolError,
  dependencies,
});

export const T3workToolkit = Toolkit.make(
  T3workRenameThreadTool,
  T3workStartChildTool,
  T3workSendMessageTool,
  T3workWorkflowRunTool,
);
