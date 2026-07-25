import type {
  AtlassianBacklogBoard,
  AtlassianBacklogQuickFilter,
  AtlassianBacklogSavedFilter,
  AtlassianBacklogSprint,
} from "@t3tools/integrations-atlassian";
import type { ExternalResourceRef, ResourcePage } from "@t3tools/project-context";

import { createT3TeamPollFingerprint } from "./t3team-integration-polling.ts";

export type T3TeamBacklogSelectionInput = {
  readonly boardId?: string;
  readonly sprintId?: string;
  readonly filterId?: string;
  readonly quickFilterIds?: ReadonlyArray<string>;
};

export type T3TeamAtlassianBacklogCapabilities = {
  readonly canCreateSubtasks: boolean;
  readonly estimateFieldLabel?: string;
};

export type T3TeamAtlassianBacklogPayload = {
  readonly page: ResourcePage;
  readonly capabilities: T3TeamAtlassianBacklogCapabilities;
  readonly boards: ReadonlyArray<AtlassianBacklogBoard>;
  readonly sprints: ReadonlyArray<AtlassianBacklogSprint>;
  readonly savedFilters: ReadonlyArray<AtlassianBacklogSavedFilter>;
  readonly quickFilters: ReadonlyArray<AtlassianBacklogQuickFilter>;
  readonly selectedBoardId?: string;
  readonly selectedSprintId?: string;
  readonly selectedFilterId?: string;
};

export type T3TeamCachedAtlassianBacklogRecord = {
  readonly response: T3TeamAtlassianBacklogPayload;
  readonly updatedAt: number;
  readonly fingerprint: string;
};

export type T3TeamBacklogCacheIdentity = {
  readonly provider: string;
  readonly accountId: string;
  readonly externalProjectId: string;
};

export type BacklogResourceRef = ExternalResourceRef & {
  readonly assignee?: string;
  readonly assigneeAccountId?: string;
  readonly estimateValue?: number;
  readonly timeOriginalEstimateSeconds?: number;
  readonly subtaskCount?: number;
};

export type BacklogViewRow = {
  readonly selectedBoardId: string | null;
  readonly selectedSprintId: string | null;
  readonly selectedFilterId: string | null;
  readonly issueIdsJson: string;
  readonly boardsJson: string;
  readonly sprintsJson: string;
  readonly savedFiltersJson: string;
  readonly quickFiltersJson: string;
  readonly capabilitiesJson: string;
  readonly pageNextCursor: string | null;
  readonly pageTotalCount: number | null;
  readonly updatedAt: number;
};

export type BacklogIssueRow = {
  readonly externalProjectId: string;
  readonly issueId: string;
  readonly issueKey: string | null;
  readonly resourceJson: string;
  readonly assigneeAccountId: string | null;
};

function normalizeSelectionPart(value: string | undefined): string {
  return value?.trim().length ? value.trim() : "default";
}

function normalizeQuickFilterIds(quickFilterIds: ReadonlyArray<string> | undefined): string {
  const ids = (quickFilterIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .toSorted();
  return ids.length > 0 ? ids.join(",") : "default";
}

export function buildBacklogSelectionKey(selection?: T3TeamBacklogSelectionInput): string {
  return [
    `board=${normalizeSelectionPart(selection?.boardId)}`,
    `sprint=${normalizeSelectionPart(selection?.sprintId)}`,
    `filter=${normalizeSelectionPart(selection?.filterId)}`,
    `quickFilters=${normalizeQuickFilterIds(selection?.quickFilterIds)}`,
  ].join(":");
}

export function buildPersistedSelectionKeys(input: {
  readonly requestSelection?: T3TeamBacklogSelectionInput;
  readonly response: T3TeamAtlassianBacklogPayload;
}): ReadonlyArray<string> {
  const requestKey = buildBacklogSelectionKey(input.requestSelection);
  const resolvedKey = buildBacklogSelectionKey({
    ...(input.response.selectedBoardId ? { boardId: input.response.selectedBoardId } : {}),
    ...(input.response.selectedSprintId ? { sprintId: input.response.selectedSprintId } : {}),
    ...(input.response.selectedFilterId ? { filterId: input.response.selectedFilterId } : {}),
    ...(input.requestSelection?.quickFilterIds
      ? { quickFilterIds: input.requestSelection.quickFilterIds }
      : {}),
  });
  return requestKey === resolvedKey ? [requestKey] : [requestKey, resolvedKey];
}

export function parseJson<T>(raw: string | null | undefined): T | null {
  if (typeof raw !== "string") {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function fingerprintBacklogPayload(payload: T3TeamAtlassianBacklogPayload): string {
  return createT3TeamPollFingerprint(payload);
}

export function materializeBacklogPayload(input: {
  readonly row: BacklogViewRow;
  readonly issueRows: ReadonlyArray<BacklogIssueRow>;
}): T3TeamAtlassianBacklogPayload | null {
  const issueIds = parseJson<ReadonlyArray<string>>(input.row.issueIdsJson);
  const boards = parseJson<ReadonlyArray<AtlassianBacklogBoard>>(input.row.boardsJson);
  const sprints = parseJson<ReadonlyArray<AtlassianBacklogSprint>>(input.row.sprintsJson);
  const savedFilters = parseJson<ReadonlyArray<AtlassianBacklogSavedFilter>>(
    input.row.savedFiltersJson,
  );
  const quickFilters = parseJson<ReadonlyArray<AtlassianBacklogQuickFilter>>(
    input.row.quickFiltersJson,
  );
  const capabilities = parseJson<T3TeamAtlassianBacklogCapabilities>(input.row.capabilitiesJson);
  if (!issueIds || !boards || !sprints || !savedFilters || !quickFilters || !capabilities) {
    return null;
  }

  const issueMap = new Map<string, BacklogResourceRef>();
  for (const row of input.issueRows) {
    const parsedIssue = parseJson<BacklogResourceRef>(row.resourceJson);
    if (!parsedIssue) {
      continue;
    }
    issueMap.set(row.issueId, parsedIssue);
    if (row.issueKey) {
      issueMap.set(row.issueKey, parsedIssue);
    }
  }

  const items: BacklogResourceRef[] = [];
  for (const issueId of issueIds) {
    const issue = issueMap.get(issueId);
    if (!issue) {
      return null;
    }
    items.push(issue);
  }

  return {
    page: {
      items,
      ...(input.row.pageNextCursor ? { nextCursor: input.row.pageNextCursor } : {}),
      ...(input.row.pageTotalCount !== null ? { totalCount: input.row.pageTotalCount } : {}),
    },
    capabilities,
    boards,
    sprints,
    savedFilters,
    quickFilters,
    ...(input.row.selectedBoardId ? { selectedBoardId: input.row.selectedBoardId } : {}),
    ...(input.row.selectedSprintId ? { selectedSprintId: input.row.selectedSprintId } : {}),
    ...(input.row.selectedFilterId ? { selectedFilterId: input.row.selectedFilterId } : {}),
  };
}
