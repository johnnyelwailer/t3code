/**
 * Agent-facing ephemeral orchestration launch (`t3team.orchestration.run`). The SDK layer owns the id,
 * argument/result schemas, and group classification; the server broker supplies the engine-backed
 * implementation via `ctx.t3team.runWorkflow`. No approval gate — observability (live step
 * timeline, durable run row) is the compensating control.
 */
import * as Schema from "effect/Schema";

import { t3teamThreadWrite } from "../t3team-sdk.groups.ts";
import { defineTool } from "../t3team-sdk.ts";

/** The explicit contract an ephemeral workflow must satisfy. */
export const WorkflowRunIntent = Schema.Struct({
  goal: Schema.String,
  expectedOutcome: Schema.String,
  guardrails: Schema.Array(Schema.String),
});
export type WorkflowRunIntent = typeof WorkflowRunIntent.Type;

export const RunWorkflowToolArgs = Schema.Struct({
  /** Inline workflow TypeScript source. SUPPORTED, UNDOCUMENTED on the agent surface: a parent
   * supplying one is a draft — it goes through the same author check/fix loop as an
   * intent-only call before anything launches. */
  source: Schema.optional(Schema.String),
  /** Path to an existing `.workflow.ts` inside the project workspace root. */
  workflowPath: Schema.optional(Schema.String),
  /** A recipe id from `t3_recipe_list` (project recipes win over pack ones); runs it with its
   * scripts and tool scope. */
  recipe: Schema.optional(Schema.String),
  /** The recipe action to run; absent runs the recipe's default action. */
  action: Schema.optional(Schema.String),
  /** Launch args decoded by the workflow's `meta.inputs` schema. */
  args: Schema.optional(Schema.Unknown),
  /** Required execution contract for the workflow. */
  intent: WorkflowRunIntent,
  /** Stop this still-active run (launched from the same thread) before launching the new one. */
  replaceRunId: Schema.optional(Schema.String),
});
export type RunWorkflowToolArgs = typeof RunWorkflowToolArgs.Type;

export const RunWorkflowToolResult = Schema.Struct({
  ok: Schema.Literal(true),
  runId: Schema.String,
  /** `authoring` means the host's author agent is writing the source for this run; `accepted`
   * means the durable server owns a launched run. Either way the workflow card owns progress. */
  status: Schema.Literals(["authoring", "accepted", "completed", "suspended", "failed"]),
  /** The workflow UI owns all follow-up. The calling host agent must end its current turn
   * without adding explanatory prose after a successful handoff. */
  handoff: Schema.Literal("workflow-ui"),
  /** The validated workflow output — present only when status is `completed`. */
  output: Schema.optional(Schema.Unknown),
  /** The run's failure message — present only when status is `failed`; fix and re-run. */
  error: Schema.optional(Schema.String),
});
export type RunWorkflowToolResult = typeof RunWorkflowToolResult.Type;

export const runWorkflowTool = defineTool({
  id: "t3team.orchestration.run",
  group: t3teamThreadWrite,
  args: RunWorkflowToolArgs,
  result: RunWorkflowToolResult,
  handler: async (args, ctx) => {
    const source = args.source?.trim() ?? "";
    const workflowPath = args.workflowPath?.trim() ?? "";
    const recipe = args.recipe?.trim() ?? "";
    const action = args.action?.trim() ?? "";
    // None is the primary form: the host authors the source from `intent`. Two at once is a
    // contradiction (which one is the run?), so only that is refused.
    if ([source, workflowPath, recipe].filter((value) => value.length > 0).length > 1) {
      throw new Error(
        "t3_orchestration_run requires at most one of 'source', 'workflowPath' (an existing .workflow.ts in the workspace) or 'recipe' (a recipe id); omit all to have the orchestration authored from 'intent'.",
      );
    }
    if (action.length > 0 && recipe.length === 0) {
      throw new Error(
        "t3_orchestration_run 'action' names an action of 'recipe'; pass 'recipe' too.",
      );
    }
    const intent = {
      goal: args.intent.goal.trim(),
      expectedOutcome: args.intent.expectedOutcome.trim(),
      guardrails: args.intent.guardrails.map((guardrail) => guardrail.trim()),
    };
    if (intent.goal.length === 0 || intent.expectedOutcome.length === 0) {
      throw new Error(
        "t3_orchestration_run requires nonblank intent.goal and intent.expectedOutcome.",
      );
    }
    if (
      intent.guardrails.length === 0 ||
      intent.guardrails.some((guardrail) => guardrail.length === 0)
    ) {
      throw new Error(
        "t3_orchestration_run requires intent.guardrails with at least one nonblank guardrail.",
      );
    }
    if (!ctx.t3team?.runWorkflow) {
      throw new Error("t3_orchestration_run requires a t3team workflow client in ToolHandlerCtx.");
    }
    // The host result is re-validated against RunWorkflowToolResult by executeToolHandler.
    return (await ctx.t3team.runWorkflow({
      ...(source.length > 0 ? { source } : {}),
      ...(workflowPath.length > 0 ? { workflowPath } : {}),
      ...(recipe.length > 0 ? { recipe } : {}),
      ...(action.length > 0 ? { action } : {}),
      ...(args.args === undefined ? {} : { args: args.args }),
      intent,
      ...(args.replaceRunId === undefined ? {} : { replaceRunId: args.replaceRunId }),
    })) as RunWorkflowToolResult;
  },
});
