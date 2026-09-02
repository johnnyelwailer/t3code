/**
 * Binding glue for `t3team.orchestration.resume`: routes the broker's tool call through to the host
 * handler bound to the calling thread. Mirrors {@link ./t3team-toolBrokerBindingWorkflowStatus.ts}
 * so the dispatch module stays small.
 */
import * as Effect from "effect/Effect";

import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import type {
  ResumeWorkflowHandlerArgs,
  T3TeamWorkflowResumeToolHandlers,
} from "./t3team-toolBrokerWorkflowResumeTool.ts";

export const T3TEAM_WORKFLOW_RESUME_TOOL_ID = "t3team.orchestration.resume";

const readArgs = (value: unknown): ResumeWorkflowHandlerArgs => {
  if (!value || typeof value !== "object" || globalThis.Array.isArray(value)) {
    return {};
  }
  const record = value as { readonly runId?: unknown; readonly source?: unknown; readonly args?: unknown };
  return {
    runId: typeof record.runId === "string" ? record.runId : undefined,
    source: typeof record.source === "string" ? record.source : undefined,
    args: record.args,
  };
};

export function callT3TeamWorkflowResumeTool(input: {
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly workflowResumeTools?: T3TeamWorkflowResumeToolHandlers | undefined;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const handlers = input.workflowResumeTools;
  if (!handlers) {
    return Effect.succeed(
      errorResult(`Tool '${T3TEAM_WORKFLOW_RESUME_TOOL_ID}' is not enabled ${input.scopeLabel}.`),
    );
  }

  return foldResult(handlers.resumeWorkflowRun(readArgs(input.toolArgs)), okResult, (message) =>
    errorResult(`Failed to run ${T3TEAM_WORKFLOW_RESUME_TOOL_ID}: ${message}`),
  );
}
