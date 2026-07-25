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
  T3TeamToolBroker,
  type T3TeamToolBrokerShape,
  type T3TeamTurnToolContext,
} from "./t3team-toolBroker.ts";
import {
  createT3TeamPrelaunchToolBinding,
  createT3TeamThreadToolBinding,
} from "./t3team-toolBrokerBinding.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { makeActorSendMessage } from "./t3team-actorSendMessage.ts";
import { buildPrelaunchView } from "./t3team-toolBrokerPrelaunchView.ts";
import { makeStartChildThread } from "./t3team-toolBrokerStartChild.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";
import { buildThreadWorkspaceView } from "./t3team-toolBrokerViewWorkspace.ts";
import { setBacklogAssigneeFilterForContext } from "./t3team-toolBrokerBacklogFilter.ts";
import { bindChildProviderCatalog } from "./t3team-childProviderCatalog.ts";
import { makeRecipeToolHandlers } from "./t3team-toolBrokerRecipeTools.ts";
import { makeWorkflowToolsForThread } from "./t3team-toolBrokerWorkflowToolsWiring.ts";
import { T3TeamContextRefreshService } from "./t3team-contextRefreshService.ts";
import { makeT3TeamWidgetShowBinder } from "./t3team-toolBrokerWidgetShow.ts";

const createT3TeamToolBroker = Effect.fn("createT3TeamToolBroker")(function* () {
  // Host tools every provider may call without an explicit `surface:"t3team"`
  // tool-context (e.g. a pack driver reaching the /mcp endpoint): thread rename,
  // child spawning, running an ephemeral runbook (workflow), and inspecting/
  // validating saved or inline recipe workflows.
  const genericThreadToolIds = [
    "t3team.thread.rename",
    "t3team.thread.start_child",
    "t3team.workflow.run",
    "t3team.workflow.status",
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
  bindChildProviderCatalog(providerRegistry);
  const bindShowWidget = yield* makeT3TeamWidgetShowBinder();

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

  const loadThreadView = (threadId: ThreadIdType, toolContext: T3TeamTurnToolContext) =>
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
    },
  });

  const bindSession: T3TeamToolBrokerShape["bindSession"] = ({
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
        ...(workflowTools.workflowRunToolsForThread
          ? { workflowRunTools: workflowTools.workflowRunToolsForThread(threadId) }
          : {}),
        ...(workflowTools.workflowStatusToolsForThread
          ? { workflowStatusTools: workflowTools.workflowStatusToolsForThread(threadId) }
          : {}),
      });
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
