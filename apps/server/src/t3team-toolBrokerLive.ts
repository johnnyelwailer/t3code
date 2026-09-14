import { CommandId, type ThreadId as ThreadIdType } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { GitWorkflowService } from "./git/GitWorkflowService.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProjectSetupScriptRunner } from "./project/ProjectSetupScriptRunner.ts";
import { ProviderRegistry } from "./provider/Services/ProviderRegistry.ts";
import { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { T3TeamToolBroker, type T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import { createT3TeamPrelaunchToolBinding } from "./t3team-toolBrokerBinding.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { makeActorSendMessage } from "./t3team-actorSendMessage.ts";
import { makeManageChildrenHandler } from "./t3team-toolBrokerChildrenLive.ts";
import { T3TeamActorMailbox } from "./t3team-actorMailbox.ts";
import { buildPrelaunchView } from "./t3team-toolBrokerPrelaunchView.ts";
import { makeStartChildThread } from "./t3team-toolBrokerStartChild.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";
import { makeLoadThreadView } from "./t3team-toolBrokerViewWorkspace.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { bindChildProviderCatalog } from "./t3team-childProviderCatalog.ts";
import { makeRecipeToolHandlers } from "./t3team-toolBrokerRecipeTools.ts";
import { makeWorkflowToolsForThread } from "./t3team-toolBrokerWorkflowToolsWiring.ts";
import { T3TeamContextRefreshService } from "./t3team-contextRefreshService.ts";
import { makeT3TeamWidgetShowBinder } from "./t3team-toolBrokerWidgetShow.ts";
import { makeBindSession } from "./t3team-toolBrokerLiveSession.ts";
import { ServerSettingsService } from "./serverSettings.ts";

const createT3TeamToolBroker = Effect.fn("createT3TeamToolBroker")(function* () {
  // Host tools every provider may call without an explicit `surface:"t3team"`
  // tool-context (e.g. a pack driver reaching the /mcp endpoint): thread rename,
  // child spawning, reading the thread's own transcript (search / search_source /
  // read_message — all read-only), running an ephemeral agent orchestration, and
  // inspecting/validating saved or inline recipe orchestrations.
  const genericThreadToolIds = [
    "t3team.runtime.models",
    "t3team.runtime.provider_usage",
    "t3team.thread.rename",
    "t3team.thread.start_child",
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
  const query = yield* ProjectionSnapshotQuery;
  const orchestration = yield* OrchestrationEngineService;
  const contextStore = yield* T3TeamThreadToolContextStore;
  const contextRefresh = yield* T3TeamContextRefreshService;
  const fileSystem = Option.getOrUndefined(yield* Effect.serviceOption(FileSystem.FileSystem));
  const path = Option.getOrUndefined(yield* Effect.serviceOption(Path.Path));
  const gitWorkflow = Option.getOrUndefined(yield* Effect.serviceOption(GitWorkflowService));
  const sourceControlProviders = Option.getOrUndefined(
    yield* Effect.serviceOption(SourceControlProviderRegistry),
  );
  const projectSetupScriptRunner = Option.getOrUndefined(
    yield* Effect.serviceOption(ProjectSetupScriptRunner),
  );
  const providerRegistry = Option.getOrUndefined(yield* Effect.serviceOption(ProviderRegistry));
  const serverSettings = Option.getOrUndefined(yield* Effect.serviceOption(ServerSettingsService));
  const workflowRegistry = Option.getOrUndefined(
    yield* Effect.serviceOption(T3TeamWorkflowEngineRegistry),
  );
  bindChildProviderCatalog(providerRegistry);
  const bindShowWidget = yield* makeT3TeamWidgetShowBinder();

  // Shared inter-agent mailbox: the `drain` op claims the caller's own mailbox through the
  // SAME shared service the reactor uses (absent in hosts without the reactor, in which
  // case `drain` reports the mailbox is unavailable).
  const mailbox = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamActorMailbox));

  const loadThreadProject = (threadId: ThreadIdType) =>
    Effect.gen(function* () {
      const thread = Option.getOrUndefined(yield* query.getThreadDetailById(threadId));
      if (!thread) return yield* Effect.fail("Current t3team thread was not found.");

      const project = Option.getOrUndefined(yield* query.getProjectShellById(thread.projectId));
      if (!project) {
        return yield* Effect.fail("Current t3team project was not found.");
      }

      return { project, thread };
    });

  // Extracted to t3team-toolBrokerViewWorkspace.ts (additive LOC budget) — behavior unchanged.
  const loadThreadView = makeLoadThreadView(loadThreadProject);

  const dispatchCommand: typeof orchestration.dispatch = (command) =>
    orchestration.dispatch(command);
  const renameThread = (threadId: ThreadIdType, title: string) =>
    orchestration.dispatch({
      type: "thread.meta.update",
      commandId: CommandId.make(`server:t3team:rename:${t3teamRandomUUID()}`),
      threadId,
      title,
    });
  const recipeToolsForThread = makeRecipeToolHandlers({ fileSystem, path, loadThreadProject });
  // Ephemeral workflow tools (undefined per-tool when unwired) — see the wiring module.
  const workflowTools = yield* makeWorkflowToolsForThread({
    fileSystem,
    path,
    loadThreadProject,
    dispatch: (command) => Effect.runPromise(orchestration.dispatch(command)).then(() => undefined),
  });
  const startChildThread = makeStartChildThread({
    loadThreadProject,
    orchestration,
    contextStore,
    services: {
      ...(fileSystem ? { fileSystem } : {}),
      ...(path ? { path } : {}),
      ...(gitWorkflow ? { gitWorkflow } : {}),
      ...(sourceControlProviders ? { sourceControlProviders } : {}),
      ...(projectSetupScriptRunner ? { projectSetupScriptRunner } : {}),
      ...(providerRegistry ? { listProviders: () => providerRegistry.getProviders } : {}),
      ...(workflowRegistry
        ? { workflowLaunchThreadForChild: workflowRegistry.launchThreadForChildThread }
        : {}),
    },
  });
  const manageChildren = makeManageChildrenHandler({
    query,
    orchestration,
    ...(mailbox !== undefined ? { mailbox } : {}),
  });

  // Extracted to t3team-toolBrokerLiveSession.ts (additive LOC budget) — behavior unchanged.
  const bindSession = makeBindSession({
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

  // Deliver a first-class inter-agent ("actor") message into another thread
  // (see t3team-actorSendMessage.ts / t3team-actorMessageReactor.ts).
  const sendMessage: T3TeamToolBrokerShape["sendMessage"] = makeActorSendMessage({
    query,
    orchestration,
  });

  return { sendMessage, bindSession, bindReadOnly } satisfies T3TeamToolBrokerShape;
});

export const T3TeamToolBrokerLive = Layer.effect(T3TeamToolBroker, createT3TeamToolBroker());
