import type {
  AtlassianBacklogBoardColumn,
  AtlassianBacklogBoardColumnStatus,
} from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";

import type { T3workAtlassianBacklogPayload } from "./t3work-atlassian-backlog-cache.ts";

export type T3workAtlassianBacklogInput = {
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

export type T3workAtlassianBoardColumnsInput = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
  readonly boardId?: string;
};

export type T3workAtlassianAssignableUsersInput = {
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly query?: string;
};

export type T3workAtlassianBacklogAssigneeUpdateInput = {
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly assigneeAccountId?: string | null;
  readonly assigneeDisplayName?: string | null;
};

export type T3workAtlassianBacklogEstimateUpdateInput = {
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly estimateValue: number | null;
  readonly estimateMode?: "points" | "hours";
};

export type T3workAtlassianIssueStatusUpdateInput = {
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly targetStatus: string;
};

export type T3workAtlassianBacklogCreateSubtaskInput = {
  readonly accountId: string;
  readonly projectId: string;
  readonly parentIssueIdOrKey: string;
  readonly summary: string;
  readonly description?: string;
  readonly estimateHours?: number;
};

export type T3workAtlassianBacklogCacheMetadata = {
  readonly source: "live" | "persisted" | "stale-fallback";
  readonly updatedAt: number;
  readonly fingerprint: string;
};

export type T3workAtlassianBacklogResponse = T3workAtlassianBacklogPayload & {
  readonly cache: T3workAtlassianBacklogCacheMetadata;
};

export type T3workAtlassianBoardColumnsResponse = {
  readonly selectedBoardId?: string;
  readonly boardColumns: ReadonlyArray<AtlassianBacklogBoardColumn>;
  readonly availableStatuses: ReadonlyArray<AtlassianBacklogBoardColumnStatus>;
};

export function createCachedBacklogResponse(
  payload: T3workAtlassianBacklogPayload,
  cache: T3workAtlassianBacklogCacheMetadata,
): T3workAtlassianBacklogResponse {
  return {
    ...payload,
    cache,
  };
}
