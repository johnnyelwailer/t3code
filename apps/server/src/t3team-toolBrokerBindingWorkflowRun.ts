/**
 * Binding glue for `t3team.workflow.run` (ephemeral workflows, slice 1): routes the broker's
 * tool call through the SDK registry bridge into the host handler bound to the calling thread.
 * Mirrors {@link ./t3team-toolBrokerBindingRecipes.ts} so the dispatch module stays small.
 */
import * as Effect from "effect/Effect";

import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import type { T3TeamWorkflowRunToolHandlers } from "./t3team-toolBrokerWorkflowRunTools.ts";
import {
  executeWorkflowSdkWorkflowRunTool,
  WorkflowSdkBridgeError,
} from "./t3team-workflowSdkToolBridge.ts";

export const T3TEAM_WORKFLOW_RUN_TOOL_ID = "t3team.workflow.run";

export function callT3TeamWorkflowRunTool(input: {
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly workflowRunTools?: T3TeamWorkflowRunToolHandlers | undefined;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const handlers = input.workflowRunTools;
  if (!handlers) {
    return Effect.succeed(
      errorResult(`Tool '${T3TEAM_WORKFLOW_RUN_TOOL_ID}' is not enabled ${input.scopeLabel}.`),
    );
  }

  return foldResult(
    executeWorkflowSdkWorkflowRunTool({
      toolArgs: input.toolArgs,
      runWorkflow: (args) =>
        handlers
          .runWorkflow(args)
          .pipe(
            Effect.mapError((message) => new WorkflowSdkBridgeError({ message, cause: message })),
          ),
    }),
    okResult,
    (message) =>
      message.startsWith(`${T3TEAM_WORKFLOW_RUN_TOOL_ID} requires`)
        ? errorResult(message)
        : errorResult(`Failed to run ${T3TEAM_WORKFLOW_RUN_TOOL_ID}: ${message}`),
  );
}
