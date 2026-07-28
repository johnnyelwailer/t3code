/**
 * Backlog and board shapes for the Atlassian backend.
 *
 * Split out of `t3team-atlassianBackendTypes` to keep that file — which is the API surface itself — inside
 * the 200-line cap. These are the payloads the backlog/board routes return; the API declaration imports them
 * back, so callers see one module either way.
 */

import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import type { ResourcePage } from "@t3tools/project-context";

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

export type AtlassianBacklogQuickFilter = {
  readonly id: string;
  readonly name: string;
  readonly jql: string;
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
  readonly quickFilters: ReadonlyArray<AtlassianBacklogQuickFilter>;
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
  readonly quickFilterIds?: ReadonlyArray<string>;
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
