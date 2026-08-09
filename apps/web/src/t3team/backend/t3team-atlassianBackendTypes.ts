import type {
  ExternalProject,
  IntegrationAccount,
  IntegrationAccountRef,
} from "@t3tools/integrations-core";
import type { ResourcePage, ResourceSnapshot } from "@t3tools/project-context";

import type { TempoCapacityResponse } from "./t3team-atlassianTempoTypes";

import type {
  AtlassianBasicConnectInput,
  AtlassianOAuthConnectInput,
  AtlassianOAuthExchangeInput,
  AtlassianOAuthExchangeResult,
} from "./t3team-atlassianBackendAuthTypes";
import type { AtlassianChildIssueBackendApi } from "./t3team-atlassianBackendChildIssueTypes";
import type { AtlassianIssueContentBackendApi } from "./t3team-atlassianBackendIssueContentTypes";

export type {
  AtlassianBasicConnectInput,
  AtlassianOAuthConnectInput,
  AtlassianOAuthExchangeInput,
  AtlassianOAuthExchangeResult,
};
export type { AtlassianIssueLinkType } from "./t3team-atlassianBackendIssueContentTypes";
export type { AtlassianChildIssueType } from "./t3team-atlassianBackendChildIssueTypes";

export type AtlassianDownloadedAsset = {
  readonly base64Contents: string;
  readonly mimeType?: string;
  readonly sizeBytes: number;
};

export type {
  AtlassianBacklogCapabilities,
  AtlassianBacklogBoard,
  AtlassianBacklogBoardColumnStatus,
  AtlassianBacklogBoardColumn,
  AtlassianBacklogSprint,
  AtlassianBacklogSavedFilter,
  AtlassianBacklogQuickFilter,
  AtlassianBacklogCacheMetadata,
  AtlassianBacklogResponse,
  AtlassianBacklogSearchInput,
  AtlassianBacklogSearchResult,
  AtlassianBoardColumnsResponse,
} from "./t3team-atlassianBackendBacklogTypes";
import type {
  AtlassianBacklogResponse,
  AtlassianBacklogSearchInput,
  AtlassianBacklogSearchResult,
  AtlassianBoardColumnsResponse,
} from "./t3team-atlassianBackendBacklogTypes";

export type AtlassianAssignableUser = {
  readonly accountId: string;
  readonly displayName: string;
  readonly emailAddress?: string;
};

export type AtlassianIssueStatusLane = "todo" | "inProgress" | "review" | "done";

export type { TempoCapacityResponse, TempoUserCapacity } from "./t3team-atlassianTempoTypes";

export interface AtlassianBackendApi
  extends AtlassianIssueContentBackendApi, AtlassianChildIssueBackendApi {
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
    readonly quickFilterIds?: ReadonlyArray<string>;
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
  /** `description` is MARKDOWN, sent as authored: the server runs the same markdown→ADF converter comments
   * use. Pre-rendering or flattening it here would write the lossy projection back to Jira. */
  readonly updateIssueDescription: (input: {
    readonly accountId: string;
    readonly issueIdOrKey: string;
    readonly description: string;
  }) => Promise<void>;
  readonly createSubtask: (input: {
    readonly accountId: string;
    readonly projectId: string;
    readonly parentIssueIdOrKey: string;
    readonly summary: string;
    readonly description?: string;
    readonly estimateHours?: number;
    readonly issueTypeId?: string;
    readonly assigneeAccountId?: string | null;
  }) => Promise<{ id: string; key: string; item?: ResourcePage["items"][number] }>;
  readonly downloadAsset: (input: {
    readonly accountId: string;
    readonly url: string;
  }) => Promise<AtlassianDownloadedAsset>;
}
