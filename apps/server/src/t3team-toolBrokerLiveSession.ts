/**
 * The `bindSession` half of the live t3team tool broker: builds the per-thread
 * tool binding from the session's tool context, threading in every host tool the
 * binding dispatches. The `BindSessionDeps` bag lives in
 * `t3team-toolBrokerLiveSessionDeps.ts` (additive LOC budget).
 *
 * @module t3team-toolBrokerLiveSession
 */
import { type ThreadId as ThreadIdType } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeT3TeamDraftMutationPublisher } from "./t3team-draftMutationPublish.ts";
import { callT3TeamReadMessageTool } from "./t3team-toolBrokerBindingReadMessage.ts";
import { callT3TeamSearchSourceTool } from "./t3team-toolBrokerBindingSearchSource.ts";
import { callT3TeamSearchThreadTool } from "./t3team-toolBrokerBindingSearchThread.ts";
import { createT3TeamThreadToolBinding } from "./t3team-toolBrokerBinding.ts";
import { type T3TeamToolBrokerShape, type T3TeamTurnToolContext } from "./t3team-toolBroker.ts";
import { setBacklogAssigneeFilterForContext } from "./t3team-toolBrokerBacklogFilter.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import { buildRuntimeModelCatalog } from "./t3team-runtimeModelCatalog.ts";
import { makeReadProviderUsage } from "./t3team-toolBrokerProviderUsage.ts";
import { type BindSessionDeps } from "./t3team-toolBrokerLiveSessionDeps.ts";

export type { BindSessionDeps } from "./t3team-toolBrokerLiveSessionDeps.ts";

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
