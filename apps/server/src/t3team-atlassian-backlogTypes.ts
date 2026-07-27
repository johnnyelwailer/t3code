import type {
  AtlassianBacklogBoardColumn,
  AtlassianBacklogBoardColumnStatus,
} from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";

import type { T3TeamAtlassianBacklogPayload } from "./t3team-atlassian-backlog-cache.ts";

export type T3TeamAtlassianBacklogInput = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
  readonly limit?: number;
  readonly boardId?: string;
  readonly sprintId?: string;
  readonly filterId?: string;
  readonly quickFilterIds?: ReadonlyArray<string>;
  readonly forceRefresh?: boolean;
  readonly clearProjectCache?: boolean;
};

export type T3TeamAtlassianBoardColumnsInput = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
  readonly boardId?: string;
};

export type T3TeamAtlassianAssignableUsersInput = {
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly query?: string;
};

export type T3TeamAtlassianBacklogAssigneeUpdateInput = {
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly assigneeAccountId?: string | null;
  readonly assigneeDisplayName?: string | null;
};

export type T3TeamAtlassianBacklogEstimateUpdateInput = {
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly estimateValue: number | null;
  readonly estimateMode?: "points" | "hours";
};

export type T3TeamAtlassianIssueStatusUpdateInput = {
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly targetStatus: string;
};

export type T3TeamAtlassianBacklogCreateSubtaskInput = {
  readonly accountId: string;
  readonly projectId: string;
  readonly parentIssueIdOrKey: string;
  readonly summary: string;
  readonly description?: string;
  readonly estimateHours?: number;
  readonly issueTypeId?: string;
  readonly assigneeAccountId?: string | null;
};

export type T3TeamAtlassianChildIssueTypesInput = {
  readonly accountId: string;
  readonly projectId: string;
};

export type T3TeamAtlassianBacklogCacheMetadata = {
  readonly source: "live" | "persisted" | "stale-fallback";
  readonly updatedAt: number;
  readonly fingerprint: string;
};

export type T3TeamAtlassianBacklogResponse = T3TeamAtlassianBacklogPayload & {
  readonly cache: T3TeamAtlassianBacklogCacheMetadata;
};

export type T3TeamAtlassianBoardColumnsResponse = {
  readonly selectedBoardId?: string;
  readonly boardColumns: ReadonlyArray<AtlassianBacklogBoardColumn>;
  readonly availableStatuses: ReadonlyArray<AtlassianBacklogBoardColumnStatus>;
};

export function createCachedBacklogResponse(
  payload: T3TeamAtlassianBacklogPayload,
  cache: T3TeamAtlassianBacklogCacheMetadata,
): T3TeamAtlassianBacklogResponse {
  return {
    ...payload,
    cache,
  };
}
