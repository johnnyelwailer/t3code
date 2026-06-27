import type { ClientOrchestrationCommand } from "@t3tools/contracts";
import { MockIntegrationProvider } from "@t3tools/integrations-core/mock";
import { createMockAtlassianBackendApi } from "./t3work-mockBackendAtlassian";
import { createMockGitHubBackendApi } from "./t3work-mockBackendGitHub";
import { emitMockWelcome, simulateMockConversation } from "./t3work-mockBackendEvents";
import { INITIAL_MOCK_BACKEND_STATE } from "./t3work-mockBackendState";
import type { BackendApi, BackendState } from "./t3work-types";
import type { T3workPollingBackend, T3workPollResult } from "./t3work-pollingBackend";

const mockIntegrationProvider = new MockIntegrationProvider();

function toMockPollResult<T>(value: T): T3workPollResult<T> {
  return {
    unchanged: false,
    fingerprint: `mock:${JSON.stringify(value)}`,
    value,
  };
}

export function createMockBackend(): BackendApi {
  let state: BackendState = INITIAL_MOCK_BACKEND_STATE;
  const github = createMockGitHubBackendApi();
  const atlassian: T3workPollingBackend["atlassian"] = createMockAtlassianBackendApi({
    mockIntegrationProvider,
    toMockPollResult,
  });
  const githubBackend: T3workPollingBackend["github"] = {
    ...github,
    pollInbox: async (input) =>
      toMockPollResult(
        await github.discoverInbox({
          host: input.host,
          ...(input.projectKey ? { projectKey: input.projectKey } : {}),
          ...(input.projectTitle ? { projectTitle: input.projectTitle } : {}),
          ...(input.linkedRepositoryUrls
            ? { linkedRepositoryUrls: input.linkedRepositoryUrls }
            : {}),
        }),
      ),
  };

  function notifyState(nextState: BackendState) {
    state = nextState;
  }

  function emitLifecycleEvent() {}

  function emitThreadEvent(_threadId: string, _event: Record<string, unknown>) {}

  emitMockWelcome(emitLifecycleEvent);

  return {
    get state() {
      return state;
    },

    async connect() {
      notifyState({ ...state, connectionStatus: "connected", error: null });
    },

    async disconnect() {
      notifyState({ ...state, connectionStatus: "disconnected", error: null });
    },

    async dispatchCommand(command: ClientOrchestrationCommand) {
      if (command.type === "thread.turn.start") {
        void simulateMockConversation(
          command.threadId as string,
          (command as any).message.text,
          emitThreadEvent,
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    },

    async launchRecipeWorkflow(input) {
      if (!input.threadId) {
        return {
          ok: true,
          mode: "deterministic" as const,
          workflowRunId: `mock-${Date.now()}`,
          effects: [],
          completionActivity: {
            title: input.launch.title,
            tone: "info" as const,
          },
        };
      }

      void simulateMockConversation(input.threadId, input.kickoffMessage ?? "", emitThreadEvent);
      return { ok: true, mode: "thread" as const };
    },

    async submitRecipeCardAction() {
      return { ok: true };
    },

    async resolveWorkflowInput() {
      return undefined;
    },

    async listThreadPlacements() {
      return [];
    },

    async syncThreadToolContext() {},

    atlassian,

    github: githubBackend,

    projectWorkspace: {
      bootstrapWorkspace: async (input) => ({
        workspaceRoot: input.workspaceRoot,
        workspaceRepositoryInitialized: true,
        referencesRoot: `${input.workspaceRoot}/.t3work/references`,
        linkedRepositories: (input.linkedRepositoryUrls ?? []).map((url, index) => ({
          url,
          localPath: `${input.workspaceRoot}/.t3work/references/${String(index + 1).padStart(2, "0")}-reference`,
          status: "cloned" as const,
        })),
      }),
      discoverRecipes: async (input) => ({
        workspaceRoot: input.workspaceRoot,
        hasProjectLocalRecipes: false,
        recipes: [],
      }),
      writeContextFiles: async (input) => ({
        workspaceRoot: input.workspaceRoot,
        writtenFiles: input.files.map((file) => file.relativePath),
      }),
    },
  };
}
