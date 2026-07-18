/**
 * Binding glue for `t3work.workflow.run` (ephemeral workflows, slice 1): routes the broker's
 * tool call through the SDK registry bridge into the host handler bound to the calling thread.
 * Mirrors {@link ./t3work-toolBrokerBindingRecipes.ts} so the dispatch module stays small.
 */
import * as Effect from "effect/Effect";

import type { T3workToolCallResult } from "./t3work-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3work-toolBrokerHelpers.ts";
import type { T3workWorkflowRunToolHandlers } from "./t3work-toolBrokerWorkflowRunTools.ts";
import {
  executeWorkflowSdkWorkflowRunTool,
  WorkflowSdkBridgeError,
} from "./t3work-workflowSdkToolBridge.ts";

export const T3WORK_WORKFLOW_RUN_TOOL_ID = "t3work.workflow.run";

export function callT3workWorkflowRunTool(input: {
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly workflowRunTools?: T3workWorkflowRunToolHandlers | undefined;
}): Effect.Effect<T3workToolCallResult, never> {
  const handlers = input.workflowRunTools;
  if (!handlers) {
    return Effect.succeed(
      errorResult(`Tool '${T3WORK_WORKFLOW_RUN_TOOL_ID}' is not enabled ${input.scopeLabel}.`),
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
      message.startsWith(`${T3WORK_WORKFLOW_RUN_TOOL_ID} requires`)
        ? errorResult(message)
        : errorResult(`Failed to run ${T3WORK_WORKFLOW_RUN_TOOL_ID}: ${message}`),
  );
}
