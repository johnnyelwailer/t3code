import type {
  AtlassianAccessibleResource,
  TokenExchangeResult,
} from "@t3tools/integrations-atlassian";
import type {
  ExternalProject,
  IntegrationAccount,
  IntegrationAccountRef,
} from "@t3tools/integrations-core";
import type { ResourcePage, ResourceSnapshot } from "@t3tools/project-context";

import type { TempoCapacityResponse } from "./t3work-atlassianTempoTypes";

export type AtlassianBasicConnectInput = {
  readonly siteUrl: string;
  readonly email: string;
  readonly apiToken: string;
};

export type AtlassianOAuthConnectInput = {
  readonly sites: ReadonlyArray<AtlassianAccessibleResource>;
  readonly token: TokenExchangeResult;
};

export type AtlassianOAuthExchangeInput = {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
};

export type AtlassianOAuthExchangeResult = {
  readonly token: TokenExchangeResult;
  readonly sites: ReadonlyArray<AtlassianAccessibleResource>;
};

export type AtlassianDownloadedAsset = {
  readonly base64Contents: string;
  readonly mimeType?: string;
  readonly sizeBytes: number;
};

export type AtlassianBacklogCapabilities = {
  readonly estimateFieldLabel?: string;
  readonly canCreateSubtasks: boolean;
};

export type AtlassianBacklogBoard = {
  readonly id: string;
  readonly name: string;
  readonly type?: string;
};

export type AtlassianBacklogBoardColumnStatus = {
  readonly id?: string;
  readonly name: string;
};

export type AtlassianBacklogBoardColumn = {
  readonly name: string;
  readonly statuses: ReadonlyArray<AtlassianBacklogBoardColumnStatus>;
};

export type AtlassianBacklogSprint = {
  readonly id: string;
  readonly name: string;
  readonly state?: string;
  readonly boardId?: string;
  readonly goal?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly completeDate?: string;
};

export type AtlassianBacklogSavedFilter = {
  readonly id: string;
  readonly name: string;
  readonly jql: string;
  readonly ownerDisplayName?: string;
  readonly favourite?: boolean;
};

export type AtlassianBacklogCacheMetadata = {
  readonly source: "live" | "persisted" | "stale-fallback";
  readonly updatedAt: number;
  readonly fingerprint: string;
};

export type AtlassianBacklogResponse = {
  readonly page: ResourcePage;
  readonly capabilities: AtlassianBacklogCapabilities;
  readonly boards: ReadonlyArray<AtlassianBacklogBoard>;
  readonly sprints: ReadonlyArray<AtlassianBacklogSprint>;
  readonly savedFilters: ReadonlyArray<AtlassianBacklogSavedFilter>;
  readonly selectedBoardId?: string;
  readonly selectedSprintId?: string;
  readonly selectedFilterId?: string;
  readonly cache?: AtlassianBacklogCacheMetadata;
};

export type AtlassianBacklogSearchInput = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
  readonly query: string;
  readonly mode: "offline" | "live";
  readonly boardId?: string;
  readonly sprintId?: string;
  readonly filterId?: string;
  readonly limit?: number;
};

export type AtlassianBacklogSearchResult = {
  readonly mode: "offline" | "live";
  readonly items: ResourcePage["items"];
};

export type AtlassianBoardColumnsResponse = {
  readonly selectedBoardId?: string;
  readonly boardColumns: ReadonlyArray<AtlassianBacklogBoardColumn>;
  readonly availableStatuses: ReadonlyArray<AtlassianBacklogBoardColumnStatus>;
};

export type AtlassianAssignableUser = {
  readonly accountId: string;
  readonly displayName: string;
  readonly emailAddress?: string;
};

export type AtlassianIssueStatusLane = "todo" | "inProgress" | "review" | "done";

export type { TempoCapacityResponse, TempoUserCapacity } from "./t3work-atlassianTempoTypes";

export interface AtlassianBackendApi {
  readonly getTempoCapacity: (input: {
    readonly accountIds: ReadonlyArray<string>;
    readonly from: string;
    readonly to: string;
    readonly projectKey?: string;
    readonly atlassianAccountId?: string;
  }) => Promise<TempoCapacityResponse>;
  readonly setTempoToken: (token: string | null) => Promise<{ configured: boolean }>;
  readonly listAccounts: () => Promise<ReadonlyArray<IntegrationAccount>>;
  readonly connectBasic: (
    input: AtlassianBasicConnectInput,
  ) => Promise<ReadonlyArray<IntegrationAccount>>;
  readonly connectOAuth: (
    input: AtlassianOAuthConnectInput,
  ) => Promise<ReadonlyArray<IntegrationAccount>>;
  readonly exchangeOAuthCode: (
    input: AtlassianOAuthExchangeInput,
  ) => Promise<AtlassianOAuthExchangeResult>;
  readonly listProjects: (
    account: IntegrationAccountRef,
  ) => Promise<ReadonlyArray<ExternalProject>>;
  readonly listResources: (input: {
    readonly account: IntegrationAccountRef;
    readonly externalProjectId: string;
    readonly limit?: number;
  }) => Promise<ResourcePage>;
  readonly listBacklog: (input: {
    readonly account: IntegrationAccountRef;
    readonly externalProjectId: string;
    readonly limit?: number;
    readonly boardId?: string;
    readonly sprintId?: string;
    readonly filterId?: string;
    readonly forceRefresh?: boolean;
    readonly clearProjectCache?: boolean;
  }) => Promise<AtlassianBacklogResponse>;
  readonly searchBacklog?: (
    input: AtlassianBacklogSearchInput,
  ) => Promise<AtlassianBacklogSearchResult>;
  readonly getBoardColumns: (input: {
    readonly account: IntegrationAccountRef;
    readonly externalProjectId: string;
    readonly boardId?: string;
  }) => Promise<AtlassianBoardColumnsResponse>;
  readonly getResource: (input: {
    readonly accountId: string;
    readonly ref: unknown;
  }) => Promise<ResourceSnapshot>;
  readonly searchAssignableUsers: (input: {
    readonly accountId: string;
    readonly issueIdOrKey: string;
    readonly query?: string;
  }) => Promise<ReadonlyArray<AtlassianAssignableUser>>;
  readonly updateIssueAssignee: (input: {
    readonly accountId: string;
    readonly issueIdOrKey: string;
    readonly assigneeAccountId?: string | null;
    readonly assigneeDisplayName?: string | null;
  }) => Promise<void>;
  readonly updateIssueEstimate: (input: {
    readonly accountId: string;
    readonly issueIdOrKey: string;
    readonly estimateValue: number | null;
    readonly estimateMode?: "points" | "hours";
  }) => Promise<{ label: string }>;
  readonly updateIssueStatus: (input: {
    readonly accountId: string;
    readonly issueIdOrKey: string;
    readonly targetStatus: string;
  }) => Promise<{ status: string }>;
  readonly createSubtask: (input: {
    readonly accountId: string;
    readonly projectId: string;
    readonly parentIssueIdOrKey: string;
    readonly summary: string;
    readonly description?: string;
    readonly estimateHours?: number;
  }) => Promise<{ id: string; key: string; item?: ResourcePage["items"][number] }>;
  readonly downloadAsset: (input: {
    readonly accountId: string;
    readonly url: string;
  }) => Promise<AtlassianDownloadedAsset>;
}
