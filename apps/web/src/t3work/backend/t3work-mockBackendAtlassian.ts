import type { MockIntegrationProvider } from "@t3tools/integrations-core/mock";
import { randomUUID } from "~/t3work/lib/t3work-utils";

import type { T3workPollResult, T3workPollingBackend } from "./t3work-pollingBackend";
import type {
  AtlassianAssignableUser,
  AtlassianBacklogResponse,
  AtlassianBoardColumnsResponse,
} from "./t3work-types";

const MOCK_ASSIGNABLE_USERS: ReadonlyArray<AtlassianAssignableUser> = [
  { accountId: "mock-user-1", displayName: "Alex Rivera", emailAddress: "alex@example.com" },
  { accountId: "mock-user-2", displayName: "Sam Becker", emailAddress: "sam@example.com" },
  { accountId: "mock-user-3", displayName: "Taylor Kim", emailAddress: "taylor@example.com" },
];

async function createMockBacklogResponse(
  mockIntegrationProvider: MockIntegrationProvider,
  input: {
    readonly account: { readonly id: string; readonly provider: string };
    readonly externalProjectId: string;
    readonly limit?: number;
  },
): Promise<AtlassianBacklogResponse> {
  const page = await mockIntegrationProvider.listResources(input);

  return {
    page,
    capabilities: {
      estimateFieldLabel: "Story Points",
      canCreateSubtasks: true,
    },
    boards: [],
    sprints: [],
    savedFilters: [],
    cache: {
      source: "live",
      updatedAt: Date.now(),
      fingerprint: `mock:${JSON.stringify(page)}`,
    },
  };
}

async function createMockBoardColumnsResponse(): Promise<AtlassianBoardColumnsResponse> {
  return {
    selectedBoardId: "mock-board-1",
    availableStatuses: [
      { name: "Accepted" },
      { name: "Done" },
      { name: "In Progress" },
      { name: "In Test" },
      { name: "To Do" },
    ],
    boardColumns: [
      { name: "To Do", statuses: [{ name: "To Do" }] },
      { name: "In Progress", statuses: [{ name: "In Progress" }, { name: "Accepted" }] },
      { name: "Review", statuses: [{ name: "In Test" }] },
      { name: "Done", statuses: [{ name: "Done" }] },
    ],
  };
}

export function createMockAtlassianBackendApi(input: {
  mockIntegrationProvider: MockIntegrationProvider;
  toMockPollResult: <T>(value: T) => T3workPollResult<T>;
}): T3workPollingBackend["atlassian"] {
  return {
    listAccounts: async () => input.mockIntegrationProvider.listAccounts(),
    connectBasic: async () => input.mockIntegrationProvider.listAccounts(),
    connectOAuth: async () => input.mockIntegrationProvider.listAccounts(),
    exchangeOAuthCode: async () => ({
      token: {
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        expiresIn: 3600,
      },
      sites: [],
    }),
    listProjects: async (account) => input.mockIntegrationProvider.listProjects(account),
    listResources: async (request) => input.mockIntegrationProvider.listResources(request),
    listBacklog: async (request) =>
      createMockBacklogResponse(input.mockIntegrationProvider, request),
    getBoardColumns: async () => createMockBoardColumnsResponse(),
    pollBacklog: async (request) => {
      const response = await createMockBacklogResponse(input.mockIntegrationProvider, request);
      const fingerprint = response.cache?.fingerprint ?? `mock:${JSON.stringify(response.page)}`;
      if (request.knownFingerprint === fingerprint) {
        return {
          unchanged: true,
          fingerprint,
        };
      }

      return {
        unchanged: false,
        fingerprint,
        value: response,
      };
    },
    pollResources: async (request) =>
      input.toMockPollResult(
        await input.mockIntegrationProvider.listResources({
          account: request.account,
          externalProjectId: request.externalProjectId,
          ...(request.limit !== undefined ? { limit: request.limit } : {}),
        }),
      ),
    getResource: async (ref) => input.mockIntegrationProvider.getResource(ref.ref),
    searchAssignableUsers: async (request) => {
      const normalizedQuery = request.query?.trim().toLowerCase() ?? "";
      if (!normalizedQuery) {
        return MOCK_ASSIGNABLE_USERS;
      }

      return MOCK_ASSIGNABLE_USERS.filter((user) =>
        [user.displayName, user.emailAddress ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      );
    },
    updateIssueAssignee: async () => {},
    updateIssueEstimate: async (request) => ({
      label: request.estimateMode === "hours" ? "Hours" : "Story Points",
    }),
    updateIssueStatus: async (request) => ({
      status: request.targetStatus.trim() || "No status",
    }),
    createSubtask: async () => ({
      id: `mock-subtask-${randomUUID()}`,
      key: `MOCK-${Math.floor(Math.random() * 1000)}`,
    }),
    downloadAsset: async (request) => {
      const asset = await input.mockIntegrationProvider.downloadAsset(request.url);
      return {
        base64Contents: Buffer.from(asset.bytes).toString("base64"),
        ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
        sizeBytes: asset.bytes.byteLength,
      };
    },
  };
}
