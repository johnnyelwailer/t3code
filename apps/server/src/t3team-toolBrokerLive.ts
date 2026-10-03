/**
 * The live t3team tool broker over orchestration V2: thread and project reads
 * come from `ThreadManagementService` / `ProjectStoreV2`, commands go through
 * `ThreadManagementService.dispatch`. Child-thread lifecycle tools are upstream's
 * (`delegate_task`, `task_*`, `t3_thread_*`); this broker serves the fork's own
 * host tools.
 */
import { type OrchestrationV2ServerCommand } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { ServerEnvironmentIdentity } from "./environment/ServerEnvironment.ts";
import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { ProviderRegistry } from "./provider/Services/ProviderRegistry.ts";
import { bindChildProviderCatalog } from "./t3team-childProviderCatalog.ts";
import { T3TeamContextRefreshService } from "./t3team-contextRefreshService.ts";
import { ResourcePressureMonitor } from "./t3team-resourcePressureMonitor.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";
import { T3TeamToolBroker, type T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import { createT3TeamPrelaunchToolBinding } from "./t3team-toolBrokerBinding.ts";
import { makeManageChildrenHandler } from "./t3team-toolBrokerChildrenLive.ts";
import { makeBindSession } from "./t3team-toolBrokerLiveSession.ts";
import { buildPrelaunchView } from "./t3team-toolBrokerPrelaunchView.ts";
import { makeRecipeToolHandlers } from "./t3team-toolBrokerRecipeTools.ts";
import { makeT3TeamThreadReads } from "./t3team-toolBrokerThreadReads.ts";
import { makeLoadThreadView } from "./t3team-toolBrokerViewWorkspace.ts";
import { makeT3TeamWidgetShowBinder } from "./t3team-toolBrokerWidgetShow.ts";
import { makeWorkflowToolsForThread } from "./t3team-toolBrokerWorkflowToolsWiring.ts";
import { UsageLimitSources } from "./usage/UsageLimitSources.ts";

/** Host tools every provider may call without an explicit `surface:"t3team"` tool context
 * (e.g. a pack driver reaching the /mcp endpoint). */
export const T3TEAM_GENERIC_THREAD_TOOL_IDS = [
  "t3team.runtime.provider_usage",
  "t3team.thread.children",
  "t3team.thread.search",
  "t3team.thread.search_source",
  "t3team.thread.read_message",
  "t3team.orchestration.run",
  "t3team.orchestration.status",
  "t3team.orchestration.resume",
  "t3team.orchestration.pause",
  "t3team.orchestration.stop",
  "t3team.widget.show",
  "t3team.recipe.list",
  "t3team.recipe.validate",
] as const;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const createT3TeamToolBroker = Effect.fn("createT3TeamToolBroker")(function* () {
  const threads = yield* ThreadManagementService;
  const reads = makeT3TeamThreadReads({ threads, projects: yield* ProjectStoreV2 });
  const contextStore = yield* T3TeamThreadToolContextStore;
  const contextRefresh = yield* T3TeamContextRefreshService;
  const fileSystem = Option.getOrUndefined(yield* Effect.serviceOption(FileSystem.FileSystem));
  const path = Option.getOrUndefined(yield* Effect.serviceOption(Path.Path));
  const providerRegistry = Option.getOrUndefined(yield* Effect.serviceOption(ProviderRegistry));
  const usageLimitSources = Option.getOrUndefined(yield* Effect.serviceOption(UsageLimitSources));
  const resourcePressure = Option.getOrUndefined(
    yield* Effect.serviceOption(ResourcePressureMonitor),
  );
  // This server's own EnvironmentId: the children `environments` op marks it as the default.
  const serverEnvironmentIdentity = Option.getOrUndefined(
    yield* Effect.serviceOption(ServerEnvironmentIdentity),
  );
  const localEnvironmentId = serverEnvironmentIdentity
    ? yield* serverEnvironmentIdentity.getEnvironmentId
    : undefined;
  bindChildProviderCatalog(providerRegistry);

  const dispatchCommand = (command: OrchestrationV2ServerCommand) =>
    threads.dispatch(command).pipe(Effect.mapError(errorText));
  const loadThreadProject = reads.loadThreadProject;
  const workflowTools = yield* makeWorkflowToolsForThread({
    fileSystem,
    path,
    loadThreadProject,
    dispatch: (command) => Effect.runPromise(dispatchCommand(command)).then(() => undefined),
  });
  const manageChildren = yield* makeManageChildrenHandler(
    localEnvironmentId === undefined ? {} : { localEnvironmentId },
  );

  const bindSession = makeBindSession({
    contextStore,
    genericThreadToolIds: T3TEAM_GENERIC_THREAD_TOOL_IDS,
    reads,
    providerRegistry,
    usageLimitSources,
    resourcePressure,
    contextRefresh,
    dispatchCommand,
    bindShowWidget: yield* makeT3TeamWidgetShowBinder(),
    loadThreadView: makeLoadThreadView(loadThreadProject, reads.loadThreadStats),
    manageChildren,
    recipeToolsForThread: makeRecipeToolHandlers({ fileSystem, path, loadThreadProject }),
    workflowTools,
  });

  const bindReadOnly: T3TeamToolBrokerShape["bindReadOnly"] = ({
    workspaceRoot,
    callerKind,
    renderContext,
    allowedToolGroups,
  }) =>
    Effect.succeed(
      createT3TeamPrelaunchToolBinding({
        workspaceRoot,
        callerKind,
        allowedToolGroups,
        readView: () =>
          Effect.succeed(buildPrelaunchView({ workspaceRoot, callerKind, renderContext })),
      }),
    );

  return { bindSession, bindReadOnly } satisfies T3TeamToolBrokerShape;
});

export const T3TeamToolBrokerLive = Layer.effect(T3TeamToolBroker, createT3TeamToolBroker());
