/**
 * The `bindSession` half of the live t3team tool broker (split out of
 * `t3team-toolBrokerLive.ts`): builds the per-thread tool binding from the
 * session's tool context, threading in every host tool the binding dispatches.
 *
 * @module t3team-toolBrokerLiveSession
 */
import {
  type OrchestrationCommand,
  type OrchestrationProjectShell,
  type OrchestrationThread,
  type ThreadId as ThreadIdType,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { OrchestrationDispatchError } from "./orchestration/Errors.ts";
import type { ProjectionRepositoryError } from "./persistence/Errors.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import type { ProviderRegistry } from "./provider/Services/ProviderRegistry.ts";
import type { ServerSettingsService } from "./serverSettings.ts";
import type { T3TeamContextRefreshServiceShape } from "./t3team-contextRefreshService.ts";
import type { T3TeamThreadToolContextStoreShape } from "./t3team-threadToolContextStore.ts";
import { makeT3TeamDraftMutationPublisher } from "./t3team-draftMutationPublish.ts";
import {
  callT3TeamReadMessageTool,
} from "./t3team-toolBrokerBindingReadMessage.ts";
import { callT3TeamSearchSourceTool } from "./t3team-toolBrokerBindingSearchSource.ts";
import { callT3TeamSearchThreadTool } from "./t3team-toolBrokerBindingSearchThread.ts";
import { type T3TeamRecipeToolHandlers } from "./t3team-toolBrokerBindingRecipes.ts";
import { createT3TeamThreadToolBinding } from "./t3team-toolBrokerBinding.ts";
import {
  type T3TeamToolBrokerShape,
  type T3TeamTurnToolContext,
} from "./t3team-toolBroker.ts";
import { setBacklogAssigneeFilterForContext } from "./t3team-toolBrokerBacklogFilter.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import { buildRuntimeModelCatalog } from "./t3team-runtimeModelCatalog.ts";
import { makeReadProviderUsage } from "./t3team-toolBrokerProviderUsage.ts";
import { type T3TeamWorkflowControlToolHandlers } from "./t3team-toolBrokerWorkflowControlTool.ts";
import { type T3TeamWorkflowResumeToolHandlers } from "./t3team-toolBrokerWorkflowResumeTool.ts";
import { type T3TeamWorkflowRunToolHandlers } from "./t3team-toolBrokerWorkflowRunTools.ts";
import { type T3TeamWorkflowStatusToolHandlers } from "./t3team-toolBrokerWorkflowStatusTool.ts";
import type { makeT3TeamShowWidget } from "./t3team-toolBrokerWidgetShow.ts";

/** Everything `bindSession` needs, built once by `createT3TeamToolBroker`. */
export interface BindSessionDeps {
  readonly contextStore: T3TeamThreadToolContextStoreShape;
  readonly genericThreadToolIds: readonly string[];
  readonly query: ProjectionSnapshotQueryShape;
  readonly providerRegistry: ProviderRegistry | undefined;
  readonly serverSettings: ServerSettingsService | undefined;
  readonly contextRefresh: T3TeamContextRefreshServiceShape;
  readonly dispatchCommand: (
    command: OrchestrationCommand,
  ) => Effect.Effect<{ readonly sequence: number }, OrchestrationDispatchError>;
  readonly bindShowWidget: <TLoadError, TDispatchError>(
    input: Omit<Parameters<typeof makeT3TeamShowWidget<TLoadError, TDispatchError>>[0], "runtime">,
  ) => (toolArgs: unknown) => Effect.Effect<import("./t3team-toolBroker.ts").T3TeamToolCallResult>;
  readonly loadThreadView: (
    threadId: ThreadIdType,
    toolContext: T3TeamTurnToolContext,
  ) => Effect.Effect<unknown, unknown>;
  readonly renameThread: (
    threadId: ThreadIdType,
    title: string,
  ) => Effect.Effect<unknown, unknown>;
  readonly startChildThread: (
    threadId: ThreadIdType,
    rawArgs: unknown,
  ) => Effect.Effect<unknown, unknown>;
  readonly manageChildren: (
    toolArgs: unknown,
    callerThreadId: ThreadIdType,
  ) => Effect.Effect<import("./t3team-toolBroker.ts").T3TeamToolCallResult>;
  readonly recipeToolsForThread: (threadId: ThreadIdType) => T3TeamRecipeToolHandlers;
  readonly workflowTools: {
    readonly workflowRunToolsForThread?: (
      threadId: ThreadIdType,
    ) => T3TeamWorkflowRunToolHandlers;
    readonly workflowStatusToolsForThread?: (
      threadId: ThreadIdType,
    ) => T3TeamWorkflowStatusToolHandlers;
    readonly workflowResumeToolsForThread?: (
      threadId: ThreadIdType,
    ) => T3TeamWorkflowResumeToolHandlers;
    readonly workflowControlToolsForThread?: (
      threadId: ThreadIdType,
    ) => T3TeamWorkflowControlToolHandlers;
  };
  readonly loadThreadProject: (
    threadId: ThreadIdType,
  ) => Effect.Effect<
    { readonly project: OrchestrationProjectShell; readonly thread: OrchestrationThread },
    ProjectionRepositoryError | string,
  >;
}

export function makeBindSession(deps: BindSessionDeps): T3TeamToolBrokerShape["bindSession"] {
  const {
    contextStore,
    genericThreadToolIds,
    query,
    providerRegistry,
    serverSettings,
    contextRefresh,
    dispatchCommand,
    bindShowWidget,
    loadThreadView,
    renameThread,
    startChildThread,
    manageChildren,
    recipeToolsForThread,
    workflowTools,
    loadThreadProject,
  } = deps;

  return ({ threadId, toolContext, allowedToolGroups }) =>
    Effect.gen(function* () {
      if (toolContext !== undefined) {
        yield* contextStore.put({ threadId, toolContext });
      }

      const storedToolContext = toolContext ?? (yield* contextStore.get(threadId));
      const resolvedToolContext =
        storedToolContext?.surface === "t3team"
          ? storedToolContext
          : {
              surface: "t3team",
              state: null,
              tools: genericThreadToolIds.map((id) => ({
                id,
                capabilities: ["write" as const],
              })),
            };

      const toolIds = Array.from(new Set(resolvedToolContext.tools.map((tool) => tool.id)));
      if (toolIds.length === 0) {
        return undefined;
      }

      return createT3TeamThreadToolBinding({
        showWidget: bindShowWidget({
          threadId,
          loadThreadProject: () => loadThreadProject(threadId),
          dispatch: dispatchCommand,
        }),
        publishDraft: makeT3TeamDraftMutationPublisher({ threadId, dispatch: dispatchCommand }),
        threadId,
        toolContext: resolvedToolContext,
        availableToolIds: toolIds,
        allowedToolGroups,
        readView: () => loadThreadView(threadId, resolvedToolContext),
        renameThread: (title) => renameThread(threadId, title),
        renameThreadResult: (title) => ({ ok: true, threadId, title }),
        startChild: (toolArgs) => startChildThread(threadId, toolArgs),
        manageChildren: (toolArgs, callerThreadId) => manageChildren(toolArgs, callerThreadId),
        readRuntimeModels: () =>
          Effect.gen(function* () {
            const thread = Option.getOrUndefined(yield* query.getThreadDetailById(threadId));
            if (!thread) return errorResult("Current t3team thread was not found.");
            const providers = providerRegistry ? yield* providerRegistry.getProviders : [];
            return okResult(buildRuntimeModelCatalog(thread.modelSelection, providers));
          }).pipe(
            Effect.catch((error) =>
              Effect.succeed(
                errorResult(
                  `Failed to read runtime providers and models: ${error instanceof Error ? error.message : String(error)}`,
                ),
              ),
            ),
          ),
        readProviderUsage: (toolArgs) => makeReadProviderUsage({ serverSettings })(toolArgs),
        setBacklogAssigneeFilter: (mode) =>
          setBacklogAssigneeFilterForContext(resolvedToolContext, mode),
        refreshContextBundle: contextRefresh,
        searchSourceThread: (toolArgs, bindingThreadId) =>
          callT3TeamSearchSourceTool({
            tool: "t3team.thread.search_source",
            scopeLabel: "for this thread.",
            toolArgs,
            threadId: bindingThreadId,
            loadThreadDetail: (id) =>
              query.getThreadDetailById(id).pipe(
                Effect.map(Option.getOrUndefined),
                Effect.mapError((error) =>
                  error instanceof Error ? error.message : String(error),
                ),
              ),
          }),
        readMessageThread: (toolArgs, bindingThreadId) =>
          callT3TeamReadMessageTool({
            tool: "t3team.thread.read_message",
            scopeLabel: "for this thread.",
            toolArgs,
            threadId: bindingThreadId,
            loadThreadDetail: (id) =>
              query.getThreadDetailById(id).pipe(
                Effect.map(Option.getOrUndefined),
                Effect.mapError((error) =>
                  error instanceof Error ? error.message : String(error),
                ),
              ),
          }),
        searchThread: (toolArgs, bindingThreadId) =>
          callT3TeamSearchThreadTool({
            tool: "t3team.thread.search",
            scopeLabel: "for this thread.",
            toolArgs,
            threadId: bindingThreadId,
            loadThreadDetail: (id) =>
              query.getThreadDetailById(id).pipe(
                Effect.map(Option.getOrUndefined),
                Effect.mapError((error) =>
                  error instanceof Error ? error.message : String(error),
                ),
              ),
          }),
        recipeTools: recipeToolsForThread(threadId),
        ...(workflowTools.workflowRunToolsForThread
          ? { workflowRunTools: workflowTools.workflowRunToolsForThread(threadId) }
          : {}),
        ...(workflowTools.workflowStatusToolsForThread
          ? { workflowStatusTools: workflowTools.workflowStatusToolsForThread(threadId) }
          : {}),
        ...(workflowTools.workflowResumeToolsForThread
          ? { workflowResumeTools: workflowTools.workflowResumeToolsForThread(threadId) }
          : {}),
        ...(workflowTools.workflowControlToolsForThread
          ? { workflowControlTools: workflowTools.workflowControlToolsForThread(threadId) }
          : {}),
      });
    });
}
