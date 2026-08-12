import type { ClientOrchestrationCommand } from "@t3tools/contracts";
import { MockIntegrationProvider } from "@t3tools/integrations-core/mock";
import { createMockAtlassianBackendApi } from "./t3team-mockBackendAtlassian";
import { createMockGitHubBackendApi } from "./t3team-mockBackendGitHub";
import { emitMockWelcome, simulateMockConversation } from "./t3team-mockBackendEvents";
import { INITIAL_MOCK_BACKEND_STATE } from "./t3team-mockBackendState";
import type { BackendApi, BackendState } from "./t3team-types";
import type { T3TeamPollingBackend, T3TeamPollResult } from "./t3team-pollingBackend";

const mockIntegrationProvider = new MockIntegrationProvider();

function toMockPollResult<T>(value: T): T3TeamPollResult<T> {
  return {
    unchanged: false,
    fingerprint: `mock:${JSON.stringify(value)}`,
    value,
  };
}

export function createMockBackend(): BackendApi {
  let state: BackendState = INITIAL_MOCK_BACKEND_STATE;
  const github = createMockGitHubBackendApi();
  const atlassian: T3TeamPollingBackend["atlassian"] = createMockAtlassianBackendApi({
    mockIntegrationProvider,
    toMockPollResult,
  });

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

    async controlWorkflow(input) {
      return {
        ok: true,
        status:
          input.action === "stop" ? "cancelled" : input.action === "pause" ? "paused" : "suspended",
      };
    },

    async listThreadPlacements() {
      return [];
    },

    async syncThreadToolContext() {},

    atlassian,

    github,

    projectWorkspace: {
      bootstrapWorkspace: async (input) => ({
        workspaceRoot: input.workspaceRoot,
        workspaceRepositoryInitialized: true,
        referencesRoot: `${input.workspaceRoot}/.t3team/references`,
        linkedRepositories: (input.linkedRepositoryUrls ?? []).map((url, index) => ({
          url,
          localPath: `${input.workspaceRoot}/.t3team/references/${String(index + 1).padStart(2, "0")}-reference`,
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
      refreshWorkItemContext: async (input) => ({
        ok: true,
        status: "already_synced" as const,
        projectId: input.projectId,
        ticketKey: input.ticketKey,
        availability: "full" as const,
        entryPointRelativePath: `.t3team/context/jira/${input.projectId}/items/${input.ticketKey.toLowerCase()}/entrypoint.json`,
        manifestRelativePath: `.t3team/context/jira/${input.projectId}/items/${input.ticketKey.toLowerCase()}/manifest.json`,
        includedCount: 0,
        skippedCount: 0,
      }),
      refreshWorkItemSliceContext: async (input) => ({
        ok: true,
        status: "already_synced" as const,
        projectId: input.projectId,
        ticketKey: input.ticketKey,
        focusKind: input.focusKind,
        availability: "full" as const,
        focusEntryPointRelativePath: `.t3team/context/jira/${input.projectId}/items/${input.ticketKey.toLowerCase()}/focus/${input.focusKind}.json`,
        entryPointRelativePath: `.t3team/context/jira/${input.projectId}/items/${input.ticketKey.toLowerCase()}/entrypoint.json`,
        includedCount: 0,
        skippedCount: 0,
      }),
    },
  };
}
