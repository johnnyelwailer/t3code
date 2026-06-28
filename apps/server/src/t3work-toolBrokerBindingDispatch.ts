import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  T3WORK_MCP_SERVER_NAME,
  type T3workToolBinding,
  type T3workTurnToolContext,
} from "./t3work-toolBroker.ts";
import {
  errorResult,
  foldResult,
  okResult,
  readBacklogAssigneeFilterMode,
} from "./t3work-toolBrokerHelpers.ts";
import { type BindingState, permissionMessage } from "./t3work-toolBrokerBindingPermissions.ts";
import {
  callT3workDraftMutationToolEffect,
  isT3workDraftMutationTool,
} from "./t3work-toolBrokerDraftMutationEffect.ts";
import { callT3workWorkItemRefreshContextBundleEffect } from "./t3work-toolBrokerContextSync.ts";
import { callT3workRenameTool } from "./t3work-toolBrokerBindingRename.ts";

export function dispatchT3workToolCall(input: {
  state: BindingState;
  scopeLabel: string;
  server: string;
  tool: string;
  toolArgs: unknown;
  threadId?: ThreadId;
  toolContext?: T3workTurnToolContext;
  readView: () => Effect.Effect<unknown, unknown>;
  renameThread?: (title: string) => Effect.Effect<unknown, unknown>;
  renameThreadResult?: (title: string) => unknown;
  startChild?: (arguments_: unknown) => Effect.Effect<unknown, unknown>;
  setBacklogAssigneeFilter?: (mode: "current-user") => Effect.Effect<unknown, unknown>;
}): ReturnType<T3workToolBinding["callTool"]> {
  const { server, tool, toolArgs, state } = input;
  if (server !== T3WORK_MCP_SERVER_NAME) {
    return Effect.succeed(errorResult(`Unknown MCP server '${server}'.`));
  }
  if (!state.availableToolIdSet.has(tool)) {
    return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
  }
  if (state.effectiveGroups && !state.allowedToolIdSet.has(tool)) {
    return Effect.succeed(errorResult(permissionMessage(tool, state.effectiveGroups)));
  }
  if (tool === "t3work.thread.rename") {
    return callT3workRenameTool({
      tool,
      scopeLabel: input.scopeLabel,
      toolArgs,
      ...(input.renameThread ? { renameThread: input.renameThread } : {}),
      ...(input.renameThreadResult ? { renameThreadResult: input.renameThreadResult } : {}),
    });
  }
  if (tool === "t3work.thread.start_child") {
    if (!input.startChild) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
    }
    return foldResult(input.startChild(toolArgs), okResult, (message) =>
      errorResult(`Failed to start child session: ${message}`),
    );
  }
  if (tool === "t3work.backlog.set_assignee_filter") {
    if (!input.setBacklogAssigneeFilter) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
    }
    const mode = readBacklogAssigneeFilterMode(toolArgs);
    if (!mode) {
      return Effect.succeed(
        errorResult("t3work.backlog.set_assignee_filter requires mode: 'current-user'."),
      );
    }
    return foldResult(input.setBacklogAssigneeFilter(mode), okResult, (message) =>
      errorResult(`Failed to update backlog assignee filter: ${message}`),
    );
  }
  if (isT3workDraftMutationTool(tool)) {
    return callT3workDraftMutationToolEffect({ tool, toolArgs, readView: input.readView });
  }
  if (tool === "t3work.work_item.refresh_context_bundle") {
    if (!input.threadId || !input.toolContext) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
    }
    return callT3workWorkItemRefreshContextBundleEffect({
      threadId: input.threadId,
      toolArgs,
      toolContext: input.toolContext,
    });
  }
  if (tool !== "t3work.view.read") {
    return Effect.succeed(errorResult(`Tool '${tool}' is not implemented in this runtime.`));
  }
  return foldResult(input.readView(), okResult, (message) =>
    errorResult(`Failed to read t3work view: ${message}`),
  );
}
