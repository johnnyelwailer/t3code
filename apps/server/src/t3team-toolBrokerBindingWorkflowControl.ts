/**
 * Binding glue for `t3team.orchestration.pause` / `t3team.orchestration.stop`: routes the broker's
 * tool call through to the host handler bound to the calling thread. Mirrors
 * {@link ./t3team-toolBrokerBindingWorkflowResume.ts} so the dispatch module stays small.
 */
import * as Effect from "effect/Effect";

import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import type {
  ControlWorkflowHandlerArgs,
  T3TeamWorkflowControlToolHandlers,
  WorkflowControlToolAction,
} from "./t3team-toolBrokerWorkflowControlTool.ts";

export const T3TEAM_WORKFLOW_PAUSE_TOOL_ID = "t3team.orchestration.pause";
export const T3TEAM_WORKFLOW_STOP_TOOL_ID = "t3team.orchestration.stop";

const ACTION_BY_TOOL_ID: Readonly<Record<string, WorkflowControlToolAction>> = {
  [T3TEAM_WORKFLOW_PAUSE_TOOL_ID]: "pause",
  [T3TEAM_WORKFLOW_STOP_TOOL_ID]: "stop",
};

export const isT3TeamWorkflowControlTool = (tool: string): boolean => tool in ACTION_BY_TOOL_ID;

const readArgs = (value: unknown): ControlWorkflowHandlerArgs => {
  if (!value || typeof value !== "object" || globalThis.Array.isArray(value)) {
    return {};
  }
  const record = value as { readonly runId?: unknown };
  return { runId: typeof record.runId === "string" ? record.runId : undefined };
};

export function callT3TeamWorkflowControlTool(input: {
  readonly tool: string;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly workflowControlTools?: T3TeamWorkflowControlToolHandlers | undefined;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const handlers = input.workflowControlTools;
  const action = ACTION_BY_TOOL_ID[input.tool];
  if (!handlers || action === undefined) {
    return Effect.succeed(errorResult(`Tool '${input.tool}' is not enabled ${input.scopeLabel}.`));
  }
  return foldResult(
    handlers.controlWorkflowRun(action, readArgs(input.toolArgs)),
    okResult,
    (message) => errorResult(`Failed to run ${input.tool}: ${message}`),
  );
}
