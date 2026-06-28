import type { ThreadId } from "@t3tools/contracts";
import { PROJECT_RECIPE_TOOL_GROUP_BY_TOOL_ID } from "@t3tools/project-recipes";
import * as Effect from "effect/Effect";

import {
  T3WORK_CURRENT_VIEW_RESOURCE_URI,
  T3WORK_MCP_SERVER_NAME,
  type T3workPrelaunchToolBinding,
  type T3workToolBinding,
  type T3workTurnToolContext,
} from "./t3work-toolBroker.ts";
import { TOOL_SPECS, foldResource, okResult, resourceResult } from "./t3work-toolBrokerHelpers.ts";
import { buildBindingState, permissionMessage } from "./t3work-toolBrokerBindingPermissions.ts";
import { dispatchT3workToolCall } from "./t3work-toolBrokerBindingDispatch.ts";

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
  readonly toolContext?: T3workTurnToolContext;
  readonly readView: () => Effect.Effect<unknown, TReadError>;
  readonly renameThread?: (title: string) => Effect.Effect<unknown, TRenameError>;
  readonly renameThreadResult?: (title: string) => unknown;
  readonly startChild?: (arguments_: unknown) => Effect.Effect<unknown, TStartChildError>;
  readonly setBacklogAssigneeFilter?: (
    mode: "current-user",
  ) => Effect.Effect<unknown, TBacklogAssigneeFilterError>;
};

function createToolSurface<TRenameError, TStartChildError, TReadError, TBacklogAssigneeFilterError>(
  input: CreateBindingInput<
    TRenameError,
    TStartChildError,
    TReadError,
    TBacklogAssigneeFilterError
  >,
) {
  const state = buildBindingState({
    availableToolIds: input.availableToolIds,
    ...(input.allowedToolGroups ? { allowedToolGroups: input.allowedToolGroups } : {}),
    ...(input.prelaunchOnly ? { prelaunchOnly: true } : {}),
  });

  const callTool: T3workToolBinding["callTool"] = ({ server, tool, arguments: toolArgs }) =>
    dispatchT3workToolCall({
      state,
      scopeLabel: input.scopeLabel,
      server,
      tool,
      toolArgs,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.toolContext ? { toolContext: input.toolContext } : {}),
      readView: input.readView,
      ...(input.renameThread ? { renameThread: input.renameThread } : {}),
      ...(input.renameThreadResult ? { renameThreadResult: input.renameThreadResult } : {}),
      ...(input.startChild ? { startChild: input.startChild } : {}),
      ...(input.setBacklogAssigneeFilter
        ? { setBacklogAssigneeFilter: input.setBacklogAssigneeFilter }
        : {}),
    });

  const readResource: T3workToolBinding["readResource"] = ({ server, uri }) => {
    if (server !== T3WORK_MCP_SERVER_NAME) {
      return Effect.succeed(resourceResult(uri, { error: `Unknown MCP server '${server}'.` }));
    }
    if (uri !== T3WORK_CURRENT_VIEW_RESOURCE_URI) {
      return Effect.succeed(resourceResult(uri, { error: `Resource '${uri}' is not available.` }));
    }
    if (!state.availableToolIdSet.has("t3work.view.read")) {
      return Effect.succeed(resourceResult(uri, { error: `Resource '${uri}' is not available.` }));
    }
    if (state.effectiveGroups && !state.allowedToolIdSet.has("t3work.view.read")) {
      return Effect.succeed(
        resourceResult(uri, {
          error: permissionMessage("t3work.view.read", state.effectiveGroups),
        }),
      );
    }
    return foldResource(input.readView(), uri, (value) => resourceResult(uri, value));
  };

  return {
    listServers: () => [
      {
        authStatus: "unsupported" as const,
        name: T3WORK_MCP_SERVER_NAME,
        resourceTemplates: [],
        resources: state.allowedToolIdSet.has("t3work.view.read")
          ? [
              {
                uri: T3WORK_CURRENT_VIEW_RESOURCE_URI,
                name: "Current t3work view",
                mimeType: "application/json",
                description: "Latest thread and project context for this t3work view.",
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

export function createT3workThreadToolBinding<
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
    readonly toolContext: T3workTurnToolContext;
  },
): T3workToolBinding {
  return {
    threadId: input.threadId,
    ...createToolSurface({
      ...input,
      scopeLabel: "for this thread.",
    }),
  };
}

export function createT3workPrelaunchToolBinding<
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
): T3workPrelaunchToolBinding {
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
