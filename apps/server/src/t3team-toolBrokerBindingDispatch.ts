import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  T3TEAM_MCP_SERVER_NAME,
  type T3TeamToolBinding,
  type T3TeamToolCallResult,
  type T3TeamTurnToolContext,
} from "./t3team-toolBroker.ts";
import {
  errorResult,
  foldResult,
  okResult,
  readBacklogAssigneeFilterMode,
} from "./t3team-toolBrokerHelpers.ts";
import { type BindingState, permissionMessage } from "./t3team-toolBrokerBindingPermissions.ts";
import {
  callT3TeamDraftMutationToolEffect,
  isT3TeamDraftMutationTool,
} from "./t3team-toolBrokerDraftMutationEffect.ts";
import {
  callT3TeamProjectRefreshContextBundleEffect,
  callT3TeamWorkItemRefreshContextBundleEffect,
} from "./t3team-toolBrokerContextSync.ts";
import { callT3TeamRenameTool } from "./t3team-toolBrokerBindingRename.ts";
import {
  callT3TeamRecipeTool,
  isT3TeamRecipeTool,
  type T3TeamRecipeToolHandlers,
} from "./t3team-toolBrokerBindingRecipes.ts";
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
import type { T3TeamContextRefreshServiceShape } from "./t3team-contextRefreshService.ts";
import type { T3TeamDraftMutationPublisher } from "./t3team-draftMutationPublish.ts";
import { resolveT3TeamCanonicalToolId } from "./t3team-toolBrokerLegacyToolIds.ts";

export function dispatchT3TeamToolCall(input: {
  state: BindingState;
  scopeLabel: string;
  server: string;
  tool: string;
  toolArgs: unknown;
  threadId?: ThreadId;
  toolContext?: T3TeamTurnToolContext;
  readView: () => Effect.Effect<unknown, string>;
  renameThread?: (title: string) => Effect.Effect<unknown, unknown>;
  renameThreadResult?: (title: string) => unknown;
  startChild?: (arguments_: unknown) => Effect.Effect<unknown, string>;
  setBacklogAssigneeFilter?: (mode: "current-user") => Effect.Effect<unknown, string>;
  refreshContextBundle?: T3TeamContextRefreshServiceShape;
  recipeTools?: T3TeamRecipeToolHandlers;
  workflowRunTools?: T3TeamWorkflowRunToolHandlers;
  workflowStatusTools?: T3TeamWorkflowStatusToolHandlers;
  workflowResumeTools?: T3TeamWorkflowResumeToolHandlers;
  showWidget?: (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>;
  searchSourceThread?: (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>;
  searchThread?: (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>;
  readMessageThread?: (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>;
  manageChildren?: (
    toolArgs: unknown,
    callerThreadId: ThreadId,
  ) => Effect.Effect<T3TeamToolCallResult>;
  readRuntimeModels?: () => Effect.Effect<T3TeamToolCallResult>;
  publishDraft?: T3TeamDraftMutationPublisher;
}): ReturnType<T3TeamToolBinding["callTool"]> {
  const { server, toolArgs, state } = input;
  // Deprecated `t3team.workflow.*` ids resolve to the current
  // `t3team.orchestration.*` ones before the availability/permission gate.
  const tool = resolveT3TeamCanonicalToolId(input.tool);
  if (server !== T3TEAM_MCP_SERVER_NAME) {
    return Effect.succeed(errorResult(`Unknown MCP server '${server}'.`));
  }
  if (!state.availableToolIdSet.has(tool)) {
    return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
  }
  if (state.effectiveGroups && !state.allowedToolIdSet.has(tool)) {
    return Effect.succeed(errorResult(permissionMessage(tool, state.effectiveGroups)));
  }
  if (tool === "t3team.thread.rename") {
    return callT3TeamRenameTool({
      tool,
      scopeLabel: input.scopeLabel,
      toolArgs,
      ...(input.renameThread ? { renameThread: input.renameThread } : {}),
      ...(input.renameThreadResult ? { renameThreadResult: input.renameThreadResult } : {}),
    });
  }
  if (isT3TeamRecipeTool(tool)) {
    return callT3TeamRecipeTool({
      tool,
      scopeLabel: input.scopeLabel,
      toolArgs,
      ...(input.recipeTools ? { recipeTools: input.recipeTools } : {}),
    });
  }
  if (tool === T3TEAM_WORKFLOW_RUN_TOOL_ID) {
    return callT3TeamWorkflowRunTool({
      scopeLabel: input.scopeLabel,
      toolArgs,
      ...(input.workflowRunTools ? { workflowRunTools: input.workflowRunTools } : {}),
    });
  }
  if (tool === T3TEAM_WORKFLOW_STATUS_TOOL_ID) {
    return callT3TeamWorkflowStatusTool({
      scopeLabel: input.scopeLabel,
      toolArgs,
      ...(input.workflowStatusTools ? { workflowStatusTools: input.workflowStatusTools } : {}),
    });
  }
  if (tool === T3TEAM_WORKFLOW_RESUME_TOOL_ID) {
    return callT3TeamWorkflowResumeTool({
      scopeLabel: input.scopeLabel,
      toolArgs,
      ...(input.workflowResumeTools ? { workflowResumeTools: input.workflowResumeTools } : {}),
    });
  }
  if (tool === "t3team.thread.start_child") {
    if (!input.startChild) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
    }
    return foldResult(input.startChild(toolArgs), okResult, (message) =>
      errorResult(`Failed to start child session: ${message}`),
    );
  }
  if (tool === "t3team.backlog.set_assignee_filter") {
    if (!input.setBacklogAssigneeFilter) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
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
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
    }
    return input.showWidget(toolArgs);
  }
  if (tool === "t3team.thread.search") {
    if (!input.searchThread) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
    }
    return input.searchThread(toolArgs);
  }
  if (tool === "t3team.thread.search_source") {
    if (!input.searchSourceThread) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
    }
    return input.searchSourceThread(toolArgs);
  }
  if (tool === "t3team.thread.read_message") {
    if (!input.readMessageThread) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
    }
    return input.readMessageThread(toolArgs);
  }
  if (tool === "t3team.thread.children") {
    if (!input.manageChildren || !input.threadId) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
    }
    return input.manageChildren(toolArgs, input.threadId);
  }
  if (tool === "t3team.runtime.models") {
    if (!input.readRuntimeModels) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
    }
    return input.readRuntimeModels();
  }
  if (isT3TeamDraftMutationTool(tool)) {
    return callT3TeamDraftMutationToolEffect({
      tool,
      toolArgs,
      readView: input.readView,
      ...(input.publishDraft ? { publishDraft: input.publishDraft } : {}),
    });
  }
  if (tool === "t3team.project.refresh_context_bundle") {
    if (!input.threadId || !input.toolContext || !input.refreshContextBundle) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
    }
    return callT3TeamProjectRefreshContextBundleEffect({
      threadId: input.threadId,
      toolArgs,
      toolContext: input.toolContext,
      refreshService: input.refreshContextBundle,
    });
  }
  if (tool === "t3team.work_item.refresh_context_bundle") {
    if (!input.threadId || !input.toolContext || !input.refreshContextBundle) {
      return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
    }
    return callT3TeamWorkItemRefreshContextBundleEffect({
      threadId: input.threadId,
      toolArgs,
      toolContext: input.toolContext,
      refreshService: input.refreshContextBundle,
    });
  }
  if (tool !== "t3team.view.read") {
    return Effect.succeed(errorResult(`Tool '${tool}' is not implemented in this runtime.`));
  }
  return foldResult(input.readView(), okResult, (message) =>
    errorResult(`Failed to read t3team view: ${message}`),
  );
}
