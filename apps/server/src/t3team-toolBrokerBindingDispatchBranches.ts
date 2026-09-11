/**
 * Workflow/orchestration tool branches of the t3team tool-call dispatcher
 * (split out of `t3team-toolBrokerBindingDispatch.ts`).
 *
 * Returns the effect for the tool when it is a workflow tool, otherwise
 * undefined so the caller continues to the next branch.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { isT3TeamTaskJournalTool } from "./t3team-toolBrokerBindingTaskJournal.ts";
import {
  errorResult,
  foldResult,
  okResult,
  readBacklogAssigneeFilterMode,
} from "./t3team-toolBrokerHelpers.ts";
import {
  callT3TeamWorkflowRunTool,
  T3TEAM_WORKFLOW_RUN_TOOL_ID,
} from "./t3team-toolBrokerBindingWorkflowRun.ts";
import type { T3TeamWorkflowRunToolHandlers } from "./t3team-toolBrokerWorkflowRunTools.ts";
import {
  callT3TeamWorkflowStatusTool,
  T3TEAM_WORKFLOW_STATUS_TOOL_ID,
} from "./t3team-toolBrokerBindingWorkflowStatus.ts";
import type { T3TeamWorkflowStatusToolHandlers } from "./t3team-toolBrokerWorkflowStatusTool.ts";
import {
  callT3TeamWorkflowResumeTool,
  T3TEAM_WORKFLOW_RESUME_TOOL_ID,
} from "./t3team-toolBrokerBindingWorkflowResume.ts";
import type { T3TeamWorkflowResumeToolHandlers } from "./t3team-toolBrokerWorkflowResumeTool.ts";
import {
  callT3TeamWorkflowControlTool,
  isT3TeamWorkflowControlTool,
} from "./t3team-toolBrokerBindingWorkflowControl.ts";
import type { T3TeamWorkflowControlToolHandlers } from "./t3team-toolBrokerWorkflowControlTool.ts";

export function tryDispatchWorkflowToolCall(input: {
  readonly tool: string;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly workflowRunTools?: T3TeamWorkflowRunToolHandlers;
  readonly workflowStatusTools?: T3TeamWorkflowStatusToolHandlers;
  readonly workflowResumeTools?: T3TeamWorkflowResumeToolHandlers;
  readonly workflowControlTools?: T3TeamWorkflowControlToolHandlers;
}): Effect.Effect<T3TeamToolCallResult, never> | undefined {
  const { tool, scopeLabel, toolArgs } = input;
  if (tool === T3TEAM_WORKFLOW_RUN_TOOL_ID) {
    return callT3TeamWorkflowRunTool({
      scopeLabel,
      toolArgs,
      ...(input.workflowRunTools ? { workflowRunTools: input.workflowRunTools } : {}),
    });
  }
  if (tool === T3TEAM_WORKFLOW_STATUS_TOOL_ID) {
    return callT3TeamWorkflowStatusTool({
      scopeLabel,
      toolArgs,
      ...(input.workflowStatusTools ? { workflowStatusTools: input.workflowStatusTools } : {}),
    });
  }
  if (tool === T3TEAM_WORKFLOW_RESUME_TOOL_ID) {
    return callT3TeamWorkflowResumeTool({
      scopeLabel,
      toolArgs,
      ...(input.workflowResumeTools ? { workflowResumeTools: input.workflowResumeTools } : {}),
    });
  }
  if (isT3TeamWorkflowControlTool(tool)) {
    return callT3TeamWorkflowControlTool({
      tool,
      scopeLabel,
      toolArgs,
      ...(input.workflowControlTools ? { workflowControlTools: input.workflowControlTools } : {}),
    });
  }
  return undefined;
}

/**
 * Thread-scoped tool branches of the dispatcher (split out of
 * `t3team-toolBrokerBindingDispatch.ts`): start_child, backlog filter,
 * widget, thread search/read/children, and runtime model/usage reads.
 *
 * Returns the effect for the tool when it is one of these, otherwise
 * undefined so the caller continues to the next branch.
 */
export function tryDispatchThreadScopedToolCall(input: {
  readonly tool: string;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly threadId?: ThreadId;
  readonly startChild?: (arguments_: unknown) => Effect.Effect<unknown, string>;
  readonly setBacklogAssigneeFilter?: (mode: "current-user") => Effect.Effect<unknown, string>;
  readonly showWidget?: (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>;
  readonly searchSourceThread?: (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>;
  readonly searchThread?: (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>;
  /** Durable per-thread task journal (`t3team.task.write` / `t3team.task.list`);
   * one callback for both ids because they share a store and a thread binding. */
  readonly taskJournal?: (tool: string, toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>;
  readonly readMessageThread?: (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>;
  readonly manageChildren?: (
    toolArgs: unknown,
    callerThreadId: ThreadId,
  ) => Effect.Effect<T3TeamToolCallResult>;
  readonly readRuntimeModels?: () => Effect.Effect<T3TeamToolCallResult>;
  readonly readProviderUsage?: (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>;
}): Effect.Effect<T3TeamToolCallResult, never> | undefined {
  const { tool, scopeLabel, toolArgs } = input;
  if (tool === "t3team.thread.start_child") {
    if (!input.startChild) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${scopeLabel}.`));
    }
    return foldResult(input.startChild(toolArgs), okResult, (message) =>
      errorResult(`Failed to start child session: ${message}`),
    );
  }
  if (tool === "t3team.backlog.set_assignee_filter") {
    if (!input.setBacklogAssigneeFilter) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${scopeLabel}.`));
    }
    const mode = readBacklogAssigneeFilterMode(toolArgs);
    if (!mode) {
      return Effect.succeed(
        errorResult("t3team.backlog.set_assignee_filter requires mode: 'current-user'."),
      );
    }
    return foldResult(input.setBacklogAssigneeFilter(mode), okResult, (message) =>
      errorResult(`Failed to update backlog assignee filter: ${message}`),
    );
  }
  if (tool === "t3team.widget.show") {
    if (!input.showWidget) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${scopeLabel}.`));
    }
    return input.showWidget(toolArgs);
  }
  if (tool === "t3team.thread.search") {
    if (!input.searchThread) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${scopeLabel}.`));
    }
    return input.searchThread(toolArgs);
  }
  if (isT3TeamTaskJournalTool(tool)) {
    if (!input.taskJournal) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${scopeLabel}.`));
    }
    return input.taskJournal(tool, toolArgs);
  }
  if (tool === "t3team.thread.search_source") {
    if (!input.searchSourceThread) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${scopeLabel}.`));
    }
    return input.searchSourceThread(toolArgs);
  }
  if (tool === "t3team.thread.read_message") {
    if (!input.readMessageThread) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${scopeLabel}.`));
    }
    return input.readMessageThread(toolArgs);
  }
  if (tool === "t3team.thread.children") {
    if (!input.manageChildren || !input.threadId) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${scopeLabel}.`));
    }
    return input.manageChildren(toolArgs, input.threadId);
  }
  if (tool === "t3team.runtime.models") {
    if (!input.readRuntimeModels) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${scopeLabel}.`));
    }
    return input.readRuntimeModels();
  }
  if (tool === "t3team.runtime.provider_usage") {
    if (!input.readProviderUsage) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${scopeLabel}.`));
    }
    return input.readProviderUsage(toolArgs);
  }
  return undefined;
}
