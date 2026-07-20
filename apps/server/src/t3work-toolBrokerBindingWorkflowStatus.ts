/**
 * Binding glue for `t3work.workflow.status`: routes the broker's tool call through to the host
 * handler bound to the calling thread. Simpler than {@link ./t3work-toolBrokerBindingWorkflowRun.ts} —
 * a direct read, no SDK bridge — but mirrors its shape so the dispatch module stays small.
 */
import * as Effect from "effect/Effect";

import type { T3workToolCallResult } from "./t3work-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3work-toolBrokerHelpers.ts";
import type { T3workWorkflowStatusToolHandlers } from "./t3work-toolBrokerWorkflowStatusTool.ts";

export const T3WORK_WORKFLOW_STATUS_TOOL_ID = "t3work.workflow.status";

const readRunId = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object" || globalThis.Array.isArray(value)) {
    return undefined;
  }
  const raw = (value as { readonly runId?: unknown }).runId;
  return typeof raw === "string" ? raw : undefined;
};

export function callT3workWorkflowStatusTool(input: {
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly workflowStatusTools?: T3workWorkflowStatusToolHandlers | undefined;
}): Effect.Effect<T3workToolCallResult, never> {
  const handlers = input.workflowStatusTools;
  if (!handlers) {
    return Effect.succeed(
      errorResult(`Tool '${T3WORK_WORKFLOW_STATUS_TOOL_ID}' is not enabled ${input.scopeLabel}.`),
    );
  }

  return foldResult(handlers.getStatus({ runId: readRunId(input.toolArgs) }), okResult, (message) =>
    errorResult(`Failed to read ${T3WORK_WORKFLOW_STATUS_TOOL_ID}: ${message}`),
  );
}
