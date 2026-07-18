/**
 * Agent-facing ephemeral workflow launch (`t3work.workflow.run`). The SDK layer owns the id,
 * argument/result schemas, and group classification; the server broker supplies the engine-backed
 * implementation via `ctx.t3work.runWorkflow`. No approval gate — observability (live step
 * timeline, durable run row) is the compensating control.
 */
import * as Schema from "effect/Schema";

import { t3workThreadWrite } from "../t3work-sdk.groups.ts";
import { defineTool } from "../t3work-sdk.ts";

export const RunWorkflowToolArgs = Schema.Struct({
  /** Inline workflow TypeScript source; persisted under `.t3work-runs/<runId>/workflow.ts`. */
  source: Schema.optional(Schema.String),
  /** Path to an existing `.workflow.ts` inside the project workspace root. */
  workflowPath: Schema.optional(Schema.String),
  /** Launch args decoded by the workflow's `meta.inputs` schema. */
  args: Schema.optional(Schema.Unknown),
});
export type RunWorkflowToolArgs = typeof RunWorkflowToolArgs.Type;

export const RunWorkflowToolResult = Schema.Struct({
  ok: Schema.Literal(true),
  runId: Schema.String,
  status: Schema.Literals(["completed", "suspended", "failed"]),
  /** The validated workflow output — present only when status is `completed`. */
  output: Schema.optional(Schema.Unknown),
  /** The run's failure message — present only when status is `failed`; fix and re-run. */
  error: Schema.optional(Schema.String),
});
export type RunWorkflowToolResult = typeof RunWorkflowToolResult.Type;

export const runWorkflowTool = defineTool({
  id: "t3work.workflow.run",
  group: t3workThreadWrite,
  args: RunWorkflowToolArgs,
  result: RunWorkflowToolResult,
  handler: async (args, ctx) => {
    const source = args.source?.trim() ?? "";
    const workflowPath = args.workflowPath?.trim() ?? "";
    if ((source.length === 0) === (workflowPath.length === 0)) {
      throw new Error(
        "t3work.workflow.run requires exactly one of 'source' (inline workflow TypeScript) or 'workflowPath' (existing .workflow.ts in the workspace).",
      );
    }
    if (!ctx.t3work?.runWorkflow) {
      throw new Error("t3work.workflow.run requires a t3work workflow client in ToolHandlerCtx.");
    }
    // The host result is re-validated against RunWorkflowToolResult by executeToolHandler.
    return (await ctx.t3work.runWorkflow({
      ...(source.length > 0 ? { source } : { workflowPath }),
      ...(args.args === undefined ? {} : { args: args.args }),
    })) as RunWorkflowToolResult;
  },
});
