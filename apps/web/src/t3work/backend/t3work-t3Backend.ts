import { type ClientOrchestrationCommand, type ServerConfigStreamEvent } from "@t3tools/contracts";
import { readEnvironmentApi } from "~/environmentApi";
import { getPrimaryKnownEnvironment } from "~/environments/primary";
import { getPrimaryEnvironmentConnection } from "~/environments/runtime";
import { getServerConfig } from "~/rpc/serverState";
import type { BackendApi, BackendState } from "./t3work-types";
import {
  createAtlassianBackendApi,
  createGitHubBackendApi,
  createProjectWorkspaceBackendApi,
} from "./t3work-t3BackendApis";
import {
  createAtlassianPollingBackendApi,
  createGitHubPollingBackendApi,
} from "./t3work-pollingBackend";
import { postJson, resolveHttpBaseUrl, resolveWsUrl } from "./t3work-t3BackendHttp";
import type {
  LaunchProjectRecipeWorkflowRequest,
  LaunchProjectRecipeWorkflowResponse,
  SubmitProjectRecipeCardActionRequest,
  SubmitProjectRecipeCardActionResponse,
} from "@t3tools/project-recipes";

export function createT3Backend(wsBaseUrl: string): BackendApi {
  const httpBaseUrl = resolveHttpBaseUrl(wsBaseUrl);

  function readPrimaryOrThrow() {
    const environmentId = getPrimaryKnownEnvironment()?.environmentId;
    if (!environmentId) {
      throw new Error("Primary environment is not available.");
    }

    const api = readEnvironmentApi(environmentId);
    if (!api) {
      throw new Error("Primary environment API is not available.");
    }

    return api;
  }

  const state: BackendState = {
    connectionStatus: "connecting",
    serverConfig: getServerConfig(),
    providers: getServerConfig()?.providers ?? [],
    error: null,
  };

  async function connect() {
    try {
      resolveWsUrl(wsBaseUrl);
      await getPrimaryEnvironmentConnection().ensureBootstrapped();

      const nextState = state as Writable<BackendState>;
      nextState.connectionStatus = "connected";
      nextState.serverConfig = getServerConfig();
      nextState.providers = getServerConfig()?.providers ?? [];
      nextState.error = null;
    } catch (error) {
      const nextState = state as Writable<BackendState>;
      nextState.connectionStatus = "error";
      nextState.error = error instanceof Error ? error.message : String(error);
    }
  }

  async function disconnect() {
    const nextState = state as Writable<BackendState>;
    nextState.connectionStatus = "connecting";
  }

  async function dispatch(command: ClientOrchestrationCommand) {
    const api = readPrimaryOrThrow();
    await api.orchestration.dispatchCommand(command);
  }

  async function listThreadPlacements(input: Parameters<BackendApi["listThreadPlacements"]>[0]) {
    return postJson<
      typeof input,
      { placements: Awaited<ReturnType<BackendApi["listThreadPlacements"]>> }
    >(httpBaseUrl, "/api/t3work/thread/placements", input).then((response) => response.placements);
  }

  async function syncThreadToolContext(input: Parameters<BackendApi["syncThreadToolContext"]>[0]) {
    await postJson<typeof input, { ok: true }>(
      httpBaseUrl,
      "/api/t3work/thread/tool-context",
      input,
    );
  }

  async function launchRecipeWorkflow(input: LaunchProjectRecipeWorkflowRequest) {
    return postJson<LaunchProjectRecipeWorkflowRequest, LaunchProjectRecipeWorkflowResponse>(
      httpBaseUrl,
      "/api/t3work/thread/recipe-workflow/launch",
      input,
    );
  }

  async function submitRecipeCardAction(input: SubmitProjectRecipeCardActionRequest) {
    return postJson<SubmitProjectRecipeCardActionRequest, SubmitProjectRecipeCardActionResponse>(
      httpBaseUrl,
      "/api/t3work/thread/recipe-workflow/card-action",
      input,
    );
  }

  const atlassian = {
    ...createAtlassianBackendApi(httpBaseUrl),
    ...createAtlassianPollingBackendApi(httpBaseUrl),
  };
  const github = {
    ...createGitHubBackendApi(httpBaseUrl),
    ...createGitHubPollingBackendApi(httpBaseUrl),
  };
  const projectWorkspace = createProjectWorkspaceBackendApi(httpBaseUrl);

  return {
    get state() {
      return state;
    },
    connect,
    disconnect,
    dispatchCommand: dispatch,
    launchRecipeWorkflow,
    submitRecipeCardAction,
    listThreadPlacements,
    syncThreadToolContext,
    atlassian,
    github,
    projectWorkspace,
    subscribeConfig(listener: (event: ServerConfigStreamEvent) => void) {
      return getPrimaryEnvironmentConnection().client.server.subscribeConfig(listener);
    },
    subscribeLifecycle(listener: (event: unknown) => void) {
      return getPrimaryEnvironmentConnection().client.server.subscribeLifecycle(listener as never);
    },
    subscribeShell(listener: (event: unknown) => void) {
      const api = readPrimaryOrThrow();
      return api.orchestration.subscribeShell(listener as never);
    },
    subscribeThread(threadId: string, listener: (event: unknown) => void) {
      const api = readPrimaryOrThrow();
      return api.orchestration.subscribeThread({ threadId: threadId as never }, listener as never);
    },
  };
}

type Writable<T> = {
  -readonly [K in keyof T]: T[K];
};
