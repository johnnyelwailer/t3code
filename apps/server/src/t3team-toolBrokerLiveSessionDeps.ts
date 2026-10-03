/**
 * Dependency bag for the `bindSession` half of the live t3team tool broker.
 * `createT3TeamToolBroker` builds this once; `makeBindSession` consumes it to
 * construct the per-thread tool binding.
 *
 * @module t3team-toolBrokerLiveSessionDeps
 */
import type { OrchestrationV2ServerCommand, ThreadId as ThreadIdType } from "@t3tools/contracts";
import type * as Effect from "effect/Effect";

import type { ProviderRegistryShape } from "./provider/Services/ProviderRegistry.ts";
import type { T3TeamContextRefreshServiceShape } from "./t3team-contextRefreshService.ts";
import type { ResourcePressureMonitorShape } from "./t3team-resourcePressureMonitor.ts";
import type { T3TeamThreadToolContextStoreShape } from "./t3team-threadToolContextStore.ts";
import type { T3TeamToolCallResult, T3TeamTurnToolContext } from "./t3team-toolBroker.ts";
import type { T3TeamRecipeToolHandlers } from "./t3team-toolBrokerBindingRecipes.ts";
import type { T3TeamThreadReads } from "./t3team-toolBrokerThreadReads.ts";
import type { makeT3TeamShowWidget } from "./t3team-toolBrokerWidgetShow.ts";
import type { T3TeamWorkflowControlToolHandlers } from "./t3team-toolBrokerWorkflowControlTool.ts";
import type { T3TeamWorkflowResumeToolHandlers } from "./t3team-toolBrokerWorkflowResumeTool.ts";
import type { T3TeamWorkflowRunToolHandlers } from "./t3team-toolBrokerWorkflowRunTools.ts";
import type { T3TeamWorkflowStatusToolHandlers } from "./t3team-toolBrokerWorkflowStatusTool.ts";
import type { UsageLimitSources } from "./usage/UsageLimitSources.ts";

/** Everything `bindSession` needs, built once by `createT3TeamToolBroker`. */
export interface BindSessionDeps {
  readonly contextStore: T3TeamThreadToolContextStoreShape;
  readonly genericThreadToolIds: readonly string[];
  readonly reads: T3TeamThreadReads;
  readonly providerRegistry: ProviderRegistryShape | undefined;
  readonly usageLimitSources: UsageLimitSources["Service"] | undefined;
  readonly resourcePressure: ResourcePressureMonitorShape | undefined;
  readonly contextRefresh: T3TeamContextRefreshServiceShape;
  /** V2 command dispatch (ThreadManagementService), errors flattened to a message. */
  readonly dispatchCommand: (
    command: OrchestrationV2ServerCommand,
  ) => Effect.Effect<unknown, string>;
  readonly bindShowWidget: <TLoadError, TDispatchError>(
    input: Omit<Parameters<typeof makeT3TeamShowWidget<TLoadError, TDispatchError>>[0], "runtime">,
  ) => (toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>;
  readonly loadThreadView: (
    threadId: ThreadIdType,
    toolContext: T3TeamTurnToolContext,
  ) => Effect.Effect<unknown, string>;
  readonly manageChildren: (
    toolArgs: unknown,
    callerThreadId: ThreadIdType,
  ) => Effect.Effect<T3TeamToolCallResult>;
  readonly recipeToolsForThread: (threadId: ThreadIdType) => T3TeamRecipeToolHandlers;
  readonly workflowTools: {
    readonly workflowRunToolsForThread?:
      | ((threadId: ThreadIdType) => T3TeamWorkflowRunToolHandlers)
      | undefined;
    readonly workflowStatusToolsForThread?:
      | ((threadId: ThreadIdType) => T3TeamWorkflowStatusToolHandlers)
      | undefined;
    readonly workflowResumeToolsForThread?:
      | ((threadId: ThreadIdType) => T3TeamWorkflowResumeToolHandlers)
      | undefined;
    readonly workflowControlToolsForThread?:
      | ((threadId: ThreadIdType) => T3TeamWorkflowControlToolHandlers)
      | undefined;
  };
}
