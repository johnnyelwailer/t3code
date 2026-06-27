import { type ClientOrchestrationCommand } from "@t3tools/contracts";

import { resolveInitialPrimaryEnvironmentDescriptor } from "~/environments/primary";
import { readPrimaryServerConfig } from "~/t3work/t3work-serverState";
import { runT3workOrchestrationDispatch } from "~/t3work/t3work-orchestrationDispatch";
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

  const state: BackendState = {
    connectionStatus: "connecting",
    serverConfig: readPrimaryServerConfig(),
    providers: readPrimaryServerConfig()?.providers ?? [],
    error: null,
  };

  async function connect() {
    try {
      resolveWsUrl(wsBaseUrl);
      await resolveInitialPrimaryEnvironmentDescriptor();

      const nextState = state as Writable<BackendState>;
      nextState.connectionStatus = "connected";
      nextState.serverConfig = readPrimaryServerConfig();
      nextState.providers = readPrimaryServerConfig()?.providers ?? [];
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
    await runT3workOrchestrationDispatch(command);
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

  async function resolveWorkflowInput(input: {
    threadId: string;
    text: string;
    messageId: string;
    value?: unknown;
    correlationId?: string;
  }) {
    await postJson<typeof input, { ok: true }>(
      httpBaseUrl,
      "/api/t3work/thread/workflow/resolve-input",
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
    resolveWorkflowInput,
    listThreadPlacements,
    syncThreadToolContext,
    atlassian,
    github,
    projectWorkspace,
  };
}

type Writable<T> = {
  -readonly [K in keyof T]: T[K];
};
