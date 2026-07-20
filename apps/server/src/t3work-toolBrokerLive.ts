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
import {
  T3workToolBroker,
  type T3workToolBrokerShape,
  type T3workTurnToolContext,
} from "./t3work-toolBroker.ts";
import {
  createT3workPrelaunchToolBinding,
  createT3workThreadToolBinding,
} from "./t3work-toolBrokerBinding.ts";
import { t3workRandomUUID } from "./t3work-random.ts";
import { makeActorSendMessage } from "./t3work-actorSendMessage.ts";
import { buildPrelaunchView } from "./t3work-toolBrokerPrelaunchView.ts";
import { makeStartChildThread } from "./t3work-toolBrokerStartChild.ts";
import { T3workThreadToolContextStore } from "./t3work-threadToolContextStore.ts";
import { buildThreadWorkspaceView } from "./t3work-toolBrokerViewWorkspace.ts";
import { setBacklogAssigneeFilterForContext } from "./t3work-toolBrokerBacklogFilter.ts";
import { bindChildProviderCatalog } from "./t3work-childProviderCatalog.ts";
import { makeRecipeToolHandlers } from "./t3work-toolBrokerRecipeTools.ts";
import { makeWorkflowRunToolsForThread } from "./t3work-toolBrokerWorkflowRunLive.ts";
import { T3workContextRefreshService } from "./t3work-contextRefreshService.ts";
import { makeT3workWidgetShowBinder } from "./t3work-toolBrokerWidgetShow.ts";

const createT3workToolBroker = Effect.fn("createT3workToolBroker")(function* () {
  // Host tools every provider may call without an explicit `surface:"t3work"`
  // tool-context (e.g. a pack driver reaching the /mcp endpoint): thread rename,
  // child spawning, and running an ephemeral runbook (workflow).
  const genericThreadToolIds = [
    "t3work.thread.rename",
    "t3work.thread.start_child",
    "t3work.workflow.run",
    "t3work.widget.show",
  ] as const;
  const query = yield* ProjectionSnapshotQuery;
  const orchestration = yield* OrchestrationEngineService;
  const contextStore = yield* T3workThreadToolContextStore;
  const contextRefresh = yield* T3workContextRefreshService;
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
  bindChildProviderCatalog(providerRegistry);
  const bindShowWidget = yield* makeT3workWidgetShowBinder();

  const loadThreadProject = (threadId: ThreadIdType) =>
    Effect.gen(function* () {
      const thread = Option.getOrUndefined(yield* query.getThreadDetailById(threadId));
      if (!thread) return yield* Effect.fail("Current t3work thread was not found.");

      const project = Option.getOrUndefined(yield* query.getProjectShellById(thread.projectId));
      if (!project) {
        return yield* Effect.fail("Current t3work project was not found.");
      }

      return { project, thread };
    });

  const loadThreadView = (threadId: ThreadIdType, toolContext: T3workTurnToolContext) =>
    Effect.gen(function* () {
      const resolved = yield* loadThreadProject(threadId).pipe(Effect.option);
      const thread = Option.isSome(resolved) ? resolved.value.thread : undefined;
      const project = Option.isSome(resolved) ? resolved.value.project : undefined;
      return {
        surface: toolContext.surface,
        state: toolContext.state,
        project: project
          ? {
              id: project.id,
              title: project.title,
              workspaceRoot: project.workspaceRoot,
            }
          : null,
        thread: thread
          ? {
              id: thread.id,
              projectId: thread.projectId,
              title: thread.title,
              runtimeMode: thread.runtimeMode,
              interactionMode: thread.interactionMode,
              messageCount: thread.messages.length,
              latestTurnId: thread.latestTurn?.turnId ?? null,
              ...buildThreadWorkspaceView({ thread, project }),
            }
          : null,
      };
    });

  const renameThread = (threadId: ThreadIdType, title: string) =>
    orchestration.dispatch({
      type: "thread.meta.update",
      commandId: CommandId.make(`server:t3work:rename:${t3workRandomUUID()}`),
      threadId,
      title,
    });
  const recipeToolsForThread = makeRecipeToolHandlers({ fileSystem, path, loadThreadProject });
  // `t3work.workflow.run` (ephemeral workflows): the same durable-engine seams the recipe
  // launch route uses, bound to the calling thread (undefined when the engine isn't wired).
  const workflowRunToolsForThread = yield* makeWorkflowRunToolsForThread({
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
    },
  });

  const bindSession: T3workToolBrokerShape["bindSession"] = ({
    threadId,
    toolContext,
    allowedToolGroups,
  }) =>
    Effect.gen(function* () {
      if (toolContext !== undefined) {
        yield* contextStore.put({ threadId, toolContext });
      }

      const storedToolContext = toolContext ?? (yield* contextStore.get(threadId));
      const resolvedToolContext =
        storedToolContext?.surface === "t3work"
          ? storedToolContext
          : {
              surface: "t3work",
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

      return createT3workThreadToolBinding({
        showWidget: bindShowWidget({
          threadId,
          loadThreadProject: () => loadThreadProject(threadId),
          dispatch: (command) => orchestration.dispatch(command),
        }),
        threadId,
        toolContext: resolvedToolContext,
        availableToolIds: toolIds,
        allowedToolGroups,
        readView: () => loadThreadView(threadId, resolvedToolContext),
        renameThread: (title) => renameThread(threadId, title),
        renameThreadResult: (title) => ({ ok: true, threadId, title }),
        startChild: (toolArgs) => startChildThread(threadId, toolArgs),
        setBacklogAssigneeFilter: (mode) =>
          setBacklogAssigneeFilterForContext(resolvedToolContext, mode),
        refreshContextBundle: contextRefresh,
        recipeTools: recipeToolsForThread(threadId),
        ...(workflowRunToolsForThread
          ? { workflowRunTools: workflowRunToolsForThread(threadId) }
          : {}),
      });
    });

  const bindReadOnly: T3workToolBrokerShape["bindReadOnly"] = ({
    workspaceRoot,
    callerKind,
    renderContext,
    allowedToolGroups,
  }) =>
    Effect.succeed(
      createT3workPrelaunchToolBinding({
        workspaceRoot,
        callerKind,
        allowedToolGroups,
        readView: () =>
          Effect.succeed(buildPrelaunchView({ workspaceRoot, callerKind, renderContext })),
      }),
    );

  // Deliver a first-class inter-agent ("actor") message into another thread
  // (see t3work-actorSendMessage.ts / t3work-actorMessageReactor.ts).
  const sendMessage: T3workToolBrokerShape["sendMessage"] = makeActorSendMessage({
    query,
    orchestration,
  });

  return { sendMessage, bindSession, bindReadOnly } satisfies T3workToolBrokerShape;
});

export const T3workToolBrokerLive = Layer.effect(T3workToolBroker, createT3workToolBroker());
