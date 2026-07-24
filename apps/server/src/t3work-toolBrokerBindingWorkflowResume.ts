/**
 * Binding glue for `t3work.orchestration.resume`: routes the broker's tool call through to the host
 * handler bound to the calling thread. Mirrors {@link ./t3work-toolBrokerBindingWorkflowStatus.ts}
 * so the dispatch module stays small.
 */
import * as Effect from "effect/Effect";

import type { T3workToolCallResult } from "./t3work-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3work-toolBrokerHelpers.ts";
import type {
  ResumeWorkflowHandlerArgs,
  T3workWorkflowResumeToolHandlers,
} from "./t3work-toolBrokerWorkflowResumeTool.ts";

export const T3WORK_WORKFLOW_RESUME_TOOL_ID = "t3work.orchestration.resume";

const readArgs = (value: unknown): ResumeWorkflowHandlerArgs => {
  if (!value || typeof value !== "object" || globalThis.Array.isArray(value)) {
    return {};
  }
  const record = value as { readonly runId?: unknown; readonly source?: unknown };
  return {
    runId: typeof record.runId === "string" ? record.runId : undefined,
    source: typeof record.source === "string" ? record.source : undefined,
  };
};

export function callT3workWorkflowResumeTool(input: {
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly workflowResumeTools?: T3workWorkflowResumeToolHandlers | undefined;
}): Effect.Effect<T3workToolCallResult, never> {
  const handlers = input.workflowResumeTools;
  if (!handlers) {
    return Effect.succeed(
      errorResult(`Tool '${T3WORK_WORKFLOW_RESUME_TOOL_ID}' is not enabled ${input.scopeLabel}.`),
    );
  }

  return foldResult(handlers.resumeWorkflowRun(readArgs(input.toolArgs)), okResult, (message) =>
    errorResult(`Failed to run ${T3WORK_WORKFLOW_RESUME_TOOL_ID}: ${message}`),
  );
}
