import { type ClientOrchestrationCommand } from "@t3tools/contracts";

import { resolveInitialPrimaryEnvironmentDescriptor } from "~/environments/primary";
import { readPrimaryServerConfig } from "~/t3team/t3team-serverState";
import { runT3TeamOrchestrationDispatch } from "~/t3team/t3team-orchestrationDispatch";
import type { BackendApi, BackendState } from "./t3team-types";
import {
  createAtlassianBackendApi,
  createGitHubBackendApi,
  createProjectWorkspaceBackendApi,
} from "./t3team-t3BackendApis";
import { createAtlassianPollingBackendApi } from "./t3team-pollingBackend";
import { createAtlassianProjectIssuesBackendApi } from "./t3team-projectIssuesBackend";
import { postJson, resolveHttpBaseUrl, resolveWsUrl } from "./t3team-t3BackendHttp";
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
    await runT3TeamOrchestrationDispatch(command);
  }

  async function forkThread(input: Parameters<BackendApi["forkThread"]>[0]) {
    return postJson<typeof input, Awaited<ReturnType<BackendApi["forkThread"]>>>(
      httpBaseUrl,
      "/api/t3team/thread/fork",
      input,
    );
  }

  async function listThreadPlacements(input: Parameters<BackendApi["listThreadPlacements"]>[0]) {
    return postJson<
      typeof input,
      { placements: Awaited<ReturnType<BackendApi["listThreadPlacements"]>> }
    >(httpBaseUrl, "/api/t3team/thread/placements", input).then((response) => response.placements);
  }

  async function syncThreadToolContext(input: Parameters<BackendApi["syncThreadToolContext"]>[0]) {
    await postJson<typeof input, { ok: true }>(
      httpBaseUrl,
      "/api/t3team/thread/tool-context",
      input,
    );
  }

  async function launchRecipeWorkflow(input: LaunchProjectRecipeWorkflowRequest) {
    return postJson<LaunchProjectRecipeWorkflowRequest, LaunchProjectRecipeWorkflowResponse>(
      httpBaseUrl,
      "/api/t3team/thread/recipe-workflow/launch",
      input,
    );
  }

  async function submitRecipeCardAction(input: SubmitProjectRecipeCardActionRequest) {
    return postJson<SubmitProjectRecipeCardActionRequest, SubmitProjectRecipeCardActionResponse>(
      httpBaseUrl,
      "/api/t3team/thread/recipe-workflow/card-action",
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
      "/api/t3team/thread/workflow/resolve-input",
      input,
    );
  }

  async function controlWorkflow(input: Parameters<NonNullable<BackendApi["controlWorkflow"]>>[0]) {
    return postJson<typeof input, Awaited<ReturnType<NonNullable<BackendApi["controlWorkflow"]>>>>(
      httpBaseUrl,
      "/api/t3team/thread/workflow/control",
      input,
    );
  }

  const atlassian = {
    ...createAtlassianBackendApi(httpBaseUrl),
    ...createAtlassianPollingBackendApi(httpBaseUrl),
    ...createAtlassianProjectIssuesBackendApi(httpBaseUrl),
  };
  const github = createGitHubBackendApi(httpBaseUrl);
  const projectWorkspace = createProjectWorkspaceBackendApi(httpBaseUrl);

  return {
    httpBaseUrl,
    get state() {
      return state;
    },
    connect,
    disconnect,
    dispatchCommand: dispatch,
    forkThread,
    launchRecipeWorkflow,
    submitRecipeCardAction,
    resolveWorkflowInput,
    controlWorkflow,
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
