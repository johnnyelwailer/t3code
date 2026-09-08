/**
 * Dependency bag for the `bindSession` half of the live t3team tool broker
 * (split out of `t3team-toolBrokerLiveSession.ts` for the additive LOC
 * budget). `createT3TeamToolBroker` builds this once; `makeBindSession`
 * consumes it to construct the per-thread tool binding.
 *
 * @module t3team-toolBrokerLiveSessionDeps
 */
import {
  type OrchestrationCommand,
  type OrchestrationProjectShell,
  type OrchestrationThread,
  type ThreadId as ThreadIdType,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { OrchestrationDispatchError } from "./orchestration/Errors.ts";
import type { ProjectionRepositoryError } from "./persistence/Errors.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import type { ProviderRegistry } from "./provider/Services/ProviderRegistry.ts";
import type { ServerSettingsService } from "./serverSettings.ts";
import type { T3TeamContextRefreshServiceShape } from "./t3team-contextRefreshService.ts";
import type { T3TeamThreadToolContextStoreShape } from "./t3team-threadToolContextStore.ts";
import { type T3TeamRecipeToolHandlers } from "./t3team-toolBrokerBindingRecipes.ts";
import {
  type T3TeamToolBrokerShape,
  type T3TeamTurnToolContext,
} from "./t3team-toolBroker.ts";
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
