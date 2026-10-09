import { resolveInitialPrimaryEnvironmentDescriptor } from "~/environments/primary";
import { readPrimaryServerConfig } from "~/t3team/t3team-serverState";
import type { BackendApi, BackendState } from "./t3team-types";
import {
  createAtlassianBackendApi,
  createGitHubBackendApi,
  createProjectWorkspaceBackendApi,
} from "./t3team-t3BackendApis";
import { createAtlassianPollingBackendApi } from "./t3team-pollingBackend";
import { createAtlassianProjectIssuesBackendApi } from "./t3team-projectIssuesBackend";
import { createMyWorkDigestBackendApi } from "./t3team-myworkDigestBackendApi";
import { createMyWorkDigestArrangementApi } from "./t3team-myworkDigestArrangementApi";
import { createPrimaryEnvironmentOrchestrationApi } from "./t3team-orchestrationApi";
import { postJson, resolveHttpBaseUrl, resolveWsUrl } from "./t3team-t3BackendHttp";
import { createThreadWorkflowApi } from "./t3team-threadWorkflowApi";

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

  const threadWorkflow = createThreadWorkflowApi((routePath, body) =>
    postJson(httpBaseUrl, routePath, body),
  );

  const atlassian = {
    ...createAtlassianBackendApi(httpBaseUrl),
    ...createAtlassianPollingBackendApi(httpBaseUrl),
    ...createAtlassianProjectIssuesBackendApi(httpBaseUrl),
    ...createMyWorkDigestBackendApi(httpBaseUrl),
    ...createMyWorkDigestArrangementApi(httpBaseUrl),
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
    orchestration: createPrimaryEnvironmentOrchestrationApi(),
    ...threadWorkflow,
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
