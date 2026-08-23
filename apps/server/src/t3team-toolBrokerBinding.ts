import type { ThreadId } from "@t3tools/contracts";
import { PROJECT_RECIPE_TOOL_GROUP_BY_TOOL_ID } from "@t3tools/project-recipes";
import * as Effect from "effect/Effect";

import {
  T3TEAM_CURRENT_VIEW_RESOURCE_URI,
  T3TEAM_MCP_SERVER_NAME,
  type T3TeamPrelaunchToolBinding,
  type T3TeamToolBinding,
  type T3TeamToolCallResult,
  type T3TeamTurnToolContext,
} from "./t3team-toolBroker.ts";
import { TOOL_SPECS, foldResource, resourceResult } from "./t3team-toolBrokerHelpers.ts";
import { buildBindingState, permissionMessage } from "./t3team-toolBrokerBindingPermissions.ts";
import { dispatchT3TeamToolCall } from "./t3team-toolBrokerBindingDispatch.ts";
import type { T3TeamRecipeToolHandlers } from "./t3team-toolBrokerBindingRecipes.ts";
import type { T3TeamWorkflowRunToolHandlers } from "./t3team-toolBrokerWorkflowRunTools.ts";
import type { T3TeamWorkflowStatusToolHandlers } from "./t3team-toolBrokerWorkflowStatusTool.ts";
import type { T3TeamWorkflowResumeToolHandlers } from "./t3team-toolBrokerWorkflowResumeTool.ts";
import type { T3TeamContextRefreshServiceShape } from "./t3team-contextRefreshService.ts";
import type { T3TeamDraftMutationPublisher } from "./t3team-draftMutationPublish.ts";

type CreateBindingInput<
  TRenameError = never,
  TStartChildError = never,
  TReadError = never,
  TBacklogAssigneeFilterError = never,
> = {
  readonly availableToolIds: ReadonlyArray<string>;
  readonly allowedToolGroups?: ReadonlyArray<string> | undefined;
  readonly scopeLabel: string;
  readonly prelaunchOnly?: boolean;
  readonly threadId?: ThreadId;
  readonly toolContext?: T3TeamTurnToolContext;
  readonly readView: () => Effect.Effect<unknown, TReadError>;
  readonly renameThread?: (title: string) => Effect.Effect<unknown, TRenameError>;
  readonly renameThreadResult?: (title: string) => unknown;
  readonly startChild?: (arguments_: unknown) => Effect.Effect<unknown, TStartChildError>;
  readonly setBacklogAssigneeFilter?: (
    mode: "current-user",
  ) => Effect.Effect<unknown, TBacklogAssigneeFilterError>;
  readonly refreshContextBundle?: T3TeamContextRefreshServiceShape;
  readonly recipeTools?: T3TeamRecipeToolHandlers;
  readonly workflowRunTools?: T3TeamWorkflowRunToolHandlers;
  readonly workflowStatusTools?: T3TeamWorkflowStatusToolHandlers;
  readonly workflowResumeTools?: T3TeamWorkflowResumeToolHandlers;
  readonly showWidget?: (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>;
  /** Search the full transcript of the thread this one was forked from. */
  readonly searchSourceThread?: (
    toolArgs: unknown,
    threadId: ThreadId,
  ) => Effect.Effect<T3TeamToolCallResult>;
  /** Read the full body of a previously delivered inter-agent message. */
  readonly readMessageThread?: (
    toolArgs: unknown,
    threadId: ThreadId,
  ) => Effect.Effect<T3TeamToolCallResult>;
  /** Manage this thread's child sessions (list/status/wait/stop/close/help). */
  readonly manageChildren?: (
    toolArgs: unknown,
    callerThreadId: ThreadId,
  ) => Effect.Effect<T3TeamToolCallResult>;
  /** Delivers a produced draft to the review surface; only thread-bound bindings have one. */
  readonly publishDraft?: T3TeamDraftMutationPublisher;
};

function createToolSurface<TRenameError, TStartChildError, TReadError, TBacklogAssigneeFilterError>(
  input: CreateBindingInput<
    TRenameError,
    TStartChildError,
    TReadError,
    TBacklogAssigneeFilterError
  >,
) {
  const toErrorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : String(cause);
  const state = buildBindingState({
    availableToolIds: input.availableToolIds,
    ...(input.allowedToolGroups ? { allowedToolGroups: input.allowedToolGroups } : {}),
    ...(input.prelaunchOnly ? { prelaunchOnly: true } : {}),
  });

  const callTool: T3TeamToolBinding["callTool"] = ({ server, tool, arguments: toolArgs }) =>
    dispatchT3TeamToolCall({
      state,
      scopeLabel: input.scopeLabel,
      server,
      tool,
      toolArgs,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.toolContext ? { toolContext: input.toolContext } : {}),
      readView: () => input.readView().pipe(Effect.mapError(toErrorMessage)),
      ...(input.renameThread ? { renameThread: input.renameThread } : {}),
      ...(input.renameThreadResult ? { renameThreadResult: input.renameThreadResult } : {}),
      ...(input.startChild
        ? {
            startChild: (arguments_: unknown) =>
              input.startChild!(arguments_).pipe(Effect.mapError(toErrorMessage)),
          }
        : {}),
      ...(input.setBacklogAssigneeFilter
        ? {
            setBacklogAssigneeFilter: (mode: "current-user") =>
              input.setBacklogAssigneeFilter!(mode).pipe(Effect.mapError(toErrorMessage)),
          }
        : {}),
      ...(input.refreshContextBundle ? { refreshContextBundle: input.refreshContextBundle } : {}),
      ...(input.recipeTools ? { recipeTools: input.recipeTools } : {}),
      ...(input.workflowRunTools ? { workflowRunTools: input.workflowRunTools } : {}),
      ...(input.workflowStatusTools ? { workflowStatusTools: input.workflowStatusTools } : {}),
      ...(input.workflowResumeTools ? { workflowResumeTools: input.workflowResumeTools } : {}),
      ...(input.showWidget ? { showWidget: input.showWidget } : {}),
      ...(input.searchSourceThread && input.threadId
        ? {
            searchSourceThread: (toolArgs: unknown) =>
              input.searchSourceThread!(toolArgs, input.threadId!),
          }
        : {}),
      ...(input.readMessageThread && input.threadId
        ? {
            readMessageThread: (toolArgs: unknown) =>
              input.readMessageThread!(toolArgs, input.threadId!),
          }
        : {}),
      ...(input.manageChildren && input.threadId
        ? {
            manageChildren: (toolArgs: unknown, callerThreadId: ThreadId) =>
              input.manageChildren!(toolArgs, callerThreadId),
          }
        : {}),
      ...(input.publishDraft ? { publishDraft: input.publishDraft } : {}),
    });

  const readResource: T3TeamToolBinding["readResource"] = ({ server, uri }) => {
    if (server !== T3TEAM_MCP_SERVER_NAME) {
      return Effect.succeed(resourceResult(uri, { error: `Unknown MCP server '${server}'.` }));
    }
    if (uri !== T3TEAM_CURRENT_VIEW_RESOURCE_URI) {
      return Effect.succeed(resourceResult(uri, { error: `Resource '${uri}' is not available.` }));
    }
    if (!state.availableToolIdSet.has("t3team.view.read")) {
      return Effect.succeed(resourceResult(uri, { error: `Resource '${uri}' is not available.` }));
    }
    if (state.effectiveGroups && !state.allowedToolIdSet.has("t3team.view.read")) {
      return Effect.succeed(
        resourceResult(uri, {
          error: permissionMessage("t3team.view.read", state.effectiveGroups),
        }),
      );
    }
    return foldResource(input.readView(), uri, (value) => resourceResult(uri, value));
  };

  return {
    listServers: () => [
      {
        authStatus: "unsupported" as const,
        name: T3TEAM_MCP_SERVER_NAME,
        resourceTemplates: [],
        resources: state.allowedToolIdSet.has("t3team.view.read")
          ? [
              {
                uri: T3TEAM_CURRENT_VIEW_RESOURCE_URI,
                name: "Current t3team view",
                mimeType: "application/json",
                description: "Latest thread and project context for this t3team view.",
              },
            ]
          : [],
        tools: Object.fromEntries(
          state.allowedToolIds.flatMap((toolId) => {
            const spec = TOOL_SPECS[toolId as keyof typeof TOOL_SPECS];
            return spec ? [[toolId, spec] as const] : [];
          }),
        ),
      },
    ],
    callTool,
    readResource,
  };
}

export function createT3TeamThreadToolBinding<
  TRenameError,
  TStartChildError,
  TReadError,
  TBacklogAssigneeFilterError,
>(
  input: Omit<
    CreateBindingInput<TRenameError, TStartChildError, TReadError, TBacklogAssigneeFilterError>,
    "scopeLabel" | "prelaunchOnly"
  > & {
    readonly threadId: ThreadId;
    readonly toolContext: T3TeamTurnToolContext;
  },
): T3TeamToolBinding {
  return {
    threadId: input.threadId,
    ...createToolSurface({
      ...input,
      scopeLabel: "for this thread.",
    }),
  };
}

export function createT3TeamPrelaunchToolBinding<
  TRenameError,
  TStartChildError,
  TReadError,
  TBacklogAssigneeFilterError,
>(
  input: Omit<
    CreateBindingInput<TRenameError, TStartChildError, TReadError, TBacklogAssigneeFilterError>,
    "availableToolIds" | "prelaunchOnly" | "scopeLabel"
  > & {
    readonly workspaceRoot: string;
    readonly callerKind: "visibility" | "view.preRender";
  },
): T3TeamPrelaunchToolBinding {
  return {
    bindingKey: `${input.callerKind}:${input.workspaceRoot}`,
    ...createToolSurface({
      ...input,
      availableToolIds: Object.keys(PROJECT_RECIPE_TOOL_GROUP_BY_TOOL_ID),
      prelaunchOnly: true,
      scopeLabel: `during ${input.callerKind} evaluation.`,
    }),
  };
}
