/**
 * The `bindSession` half of the live t3team tool broker: builds the per-thread
 * tool binding from the session's tool context, threading in every host tool the
 * binding dispatches. The `BindSessionDeps` bag lives in
 * `t3team-toolBrokerLiveSessionDeps.ts`.
 *
 * @module t3team-toolBrokerLiveSession
 */
import * as Effect from "effect/Effect";

import { withPressureLines } from "./t3team-resourcePressureToolLine.ts";
import { type T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import { setBacklogAssigneeFilterForContext } from "./t3team-toolBrokerBacklogFilter.ts";
import { createT3TeamThreadToolBinding } from "./t3team-toolBrokerBinding.ts";
import { callT3TeamReadMessageTool } from "./t3team-toolBrokerBindingReadMessage.ts";
import { callT3TeamSearchSourceTool } from "./t3team-toolBrokerBindingSearchSource.ts";
import { callT3TeamSearchThreadTool } from "./t3team-toolBrokerBindingSearchThread.ts";
import { type BindSessionDeps } from "./t3team-toolBrokerLiveSessionDeps.ts";
import { makeReadProviderUsage } from "./t3team-toolBrokerProviderUsage.ts";

export type { BindSessionDeps } from "./t3team-toolBrokerLiveSessionDeps.ts";

export function makeBindSession(deps: BindSessionDeps): T3TeamToolBrokerShape["bindSession"] {
  const { contextStore, genericThreadToolIds, reads } = deps;
  const scopeLabel = "for this thread.";

  return ({ threadId, toolContext, allowedToolGroups, grantedToolIds }) =>
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

      const toolIds = Array.from(
        new Set([...resolvedToolContext.tools.map((tool) => tool.id), ...(grantedToolIds ?? [])]),
      );
      if (toolIds.length === 0) {
        return undefined;
      }

      // Pressure-impacting tool results carry the memory-pressure line (flag off = untouched).
      const binding = createT3TeamThreadToolBinding({
        showWidget: deps.bindShowWidget({
          threadId,
          loadThreadProject: () => reads.loadThreadProject(threadId),
        }),
        publishDraft: deps.bindPublishDraft(threadId),
        threadId,
        toolContext: resolvedToolContext,
        availableToolIds: toolIds,
        allowedToolGroups,
        readView: () => deps.loadThreadView(threadId, resolvedToolContext),
        manageChildren: (toolArgs, callerThreadId) => deps.manageChildren(toolArgs, callerThreadId),
        readProviderUsage: (toolArgs) =>
          makeReadProviderUsage({
            providerRegistry: deps.providerRegistry,
            usageLimitSources: deps.usageLimitSources,
          })(toolArgs),
        setBacklogAssigneeFilter: (mode) =>
          setBacklogAssigneeFilterForContext(resolvedToolContext, mode),
        refreshContextBundle: deps.contextRefresh,
        searchSourceThread: (toolArgs, bindingThreadId) =>
          callT3TeamSearchSourceTool({
            tool: "t3team.thread.search_source",
            scopeLabel,
            toolArgs,
            threadId: bindingThreadId,
            loadThreadDetail: reads.loadSearchableThread,
          }),
        readMessageThread: (toolArgs, bindingThreadId) =>
          callT3TeamReadMessageTool({
            tool: "t3team.thread.read_message",
            scopeLabel,
            toolArgs,
            threadId: bindingThreadId,
            ...(deps.readMailboxMessage ? { readMailboxMessage: deps.readMailboxMessage } : {}),
          }),
        searchThread: (toolArgs, bindingThreadId) =>
          callT3TeamSearchThreadTool({
            tool: "t3team.thread.search",
            scopeLabel,
            toolArgs,
            threadId: bindingThreadId,
            loadThreadDetail: reads.loadSearchableThread,
          }),
        recipeTools: deps.recipeToolsForThread(threadId),
        ...(deps.myWorkTools ? { myWorkTools: deps.myWorkTools } : {}),
        ...(deps.workflowTools.workflowRunToolsForThread
          ? { workflowRunTools: deps.workflowTools.workflowRunToolsForThread(threadId) }
          : {}),
        ...(deps.workflowTools.workflowStatusToolsForThread
          ? { workflowStatusTools: deps.workflowTools.workflowStatusToolsForThread(threadId) }
          : {}),
        ...(deps.workflowTools.workflowResumeToolsForThread
          ? { workflowResumeTools: deps.workflowTools.workflowResumeToolsForThread(threadId) }
          : {}),
        ...(deps.workflowTools.workflowControlToolsForThread
          ? { workflowControlTools: deps.workflowTools.workflowControlToolsForThread(threadId) }
          : {}),
        ...(deps.changeRequestToolsForThread
          ? { changeRequestTools: deps.changeRequestToolsForThread(threadId) }
          : {}),
      });
      return withPressureLines(binding, deps.resourcePressure);
    });
}
