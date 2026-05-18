import type {
  ClientOrchestrationCommand,
  ServerConfigStreamEvent,
  ServerLifecycleStreamEvent,
} from "@t3tools/contracts";
import { MockIntegrationProvider } from "@t3tools/integrations-core/mock";
import { emitMockWelcome, simulateMockConversation } from "./t3work-mockBackendEvents";
import { INITIAL_MOCK_BACKEND_STATE } from "./t3work-mockBackendState";
import type { BackendApi, BackendState } from "./t3work-types";

const mockIntegrationProvider = new MockIntegrationProvider();

export function createMockBackend(): BackendApi {
  let state: BackendState = INITIAL_MOCK_BACKEND_STATE;
  const configListeners = new Set<(event: ServerConfigStreamEvent) => void>();
  const lifecycleListeners = new Set<(event: ServerLifecycleStreamEvent) => void>();
  const shellListeners = new Set<(event: unknown) => void>();
  const threadListeners = new Map<string, Set<(event: unknown) => void>>();

  function notifyState(nextState: BackendState) {
    state = nextState;
  }

  function emitLifecycleEvent(event: ServerLifecycleStreamEvent) {
    for (const listener of lifecycleListeners) {
      try {
        listener(event);
      } catch {
        // ignore
      }
    }
  }

  function emitThreadEvent(threadId: string, event: Record<string, unknown>) {
    const set = threadListeners.get(threadId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        // ignore
      }
    }
  }

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

    atlassian: {
      listAccounts: async () => mockIntegrationProvider.listAccounts(),
      connectBasic: async () => mockIntegrationProvider.listAccounts(),
      connectOAuth: async () => mockIntegrationProvider.listAccounts(),
      listProjects: async (account) => mockIntegrationProvider.listProjects(account),
      listResources: async (input) => mockIntegrationProvider.listResources(input),
      getResource: async (ref) => mockIntegrationProvider.getResource(ref.ref),
    },

    github: {
      discoverInbox: async (input) => ({
        host: input.host,
        account: "mock-user",
        repositories: [
          {
            id: "repo-1",
            nameWithOwner: "acme/platform",
            url: "https://github.com/acme/platform",
            host: input.host,
            updatedAt: new Date().toISOString(),
            description: "Main platform repository",
            isPrivate: true,
          },
        ],
        inboxItems: [
          {
            id: "notif-1",
            repository: "acme/platform",
            repositoryUrl: "https://github.com/acme/platform",
            reason: "mention",
            authorLogin: "alex-dev",
            reviewRequested: true,
            subjectType: "PullRequest",
            subjectTitle: "Upgrade build pipeline",
            subjectUrl: "https://github.com/acme/platform/pull/42",
            subjectBranch: "feature/ACME-42-upgrade-build-pipeline",
            subjectState: "open",
            updatedAt: new Date().toISOString(),
          },
        ],
        suggestedRepositoryUrls: ["https://github.com/acme/platform"],
      }),
    },

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
    },

    subscribeConfig(listener: (event: ServerConfigStreamEvent) => void) {
      configListeners.add(listener);
      return () => configListeners.delete(listener);
    },

    subscribeLifecycle(listener: (event: ServerLifecycleStreamEvent) => void) {
      lifecycleListeners.add(listener);
      return () => lifecycleListeners.delete(listener);
    },

    subscribeShell(listener: (event: unknown) => void) {
      shellListeners.add(listener);
      return () => shellListeners.delete(listener);
    },

    subscribeThread(threadId: string, listener: (event: unknown) => void) {
      let set = threadListeners.get(threadId);
      if (!set) {
        set = new Set();
        threadListeners.set(threadId, set);
      }
      set.add(listener);
      return () => {
        set?.delete(listener);
      };
    },
  };
}
