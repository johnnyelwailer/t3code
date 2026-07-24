/**
 * Binding glue for `t3team.workflow.status`: routes the broker's tool call through to the host
 * handler bound to the calling thread. Simpler than {@link ./t3team-toolBrokerBindingWorkflowRun.ts} —
 * a direct read, no SDK bridge — but mirrors its shape so the dispatch module stays small.
 */
import * as Effect from "effect/Effect";

import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import type { T3TeamWorkflowStatusToolHandlers } from "./t3team-toolBrokerWorkflowStatusTool.ts";

export const T3TEAM_WORKFLOW_STATUS_TOOL_ID = "t3team.workflow.status";

const readRunId = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object" || globalThis.Array.isArray(value)) {
    return undefined;
  }
  const raw = (value as { readonly runId?: unknown }).runId;
  return typeof raw === "string" ? raw : undefined;
};

export function callT3TeamWorkflowStatusTool(input: {
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly workflowStatusTools?: T3TeamWorkflowStatusToolHandlers | undefined;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const handlers = input.workflowStatusTools;
  if (!handlers) {
    return Effect.succeed(
      errorResult(`Tool '${T3TEAM_WORKFLOW_STATUS_TOOL_ID}' is not enabled ${input.scopeLabel}.`),
    );
  }

  return foldResult(handlers.getStatus({ runId: readRunId(input.toolArgs) }), okResult, (message) =>
    errorResult(`Failed to read ${T3TEAM_WORKFLOW_STATUS_TOOL_ID}: ${message}`),
  );
}
