import type {
  AtlassianBacklogBoard,
  AtlassianBacklogSavedFilter,
  AtlassianBacklogSprint,
} from "@t3tools/integrations-atlassian";
import type { ExternalResourceRef, ResourcePage } from "@t3tools/project-context";

import { createT3workPollFingerprint } from "./t3work-integration-polling.ts";

export type T3workBacklogSelectionInput = {
  readonly boardId?: string;
  readonly sprintId?: string;
  readonly filterId?: string;
};

export type T3workAtlassianBacklogCapabilities = {
  readonly canCreateSubtasks: boolean;
  readonly estimateFieldLabel?: string;
};

export type T3workAtlassianBacklogPayload = {
  readonly page: ResourcePage;
  readonly capabilities: T3workAtlassianBacklogCapabilities;
  readonly boards: ReadonlyArray<AtlassianBacklogBoard>;
  readonly sprints: ReadonlyArray<AtlassianBacklogSprint>;
  readonly savedFilters: ReadonlyArray<AtlassianBacklogSavedFilter>;
  readonly selectedBoardId?: string;
  readonly selectedSprintId?: string;
  readonly selectedFilterId?: string;
};

export type T3workCachedAtlassianBacklogRecord = {
  readonly response: T3workAtlassianBacklogPayload;
  readonly updatedAt: number;
  readonly fingerprint: string;
};

export type T3workBacklogCacheIdentity = {
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

export function buildBacklogSelectionKey(selection?: T3workBacklogSelectionInput): string {
  return [
    `board=${normalizeSelectionPart(selection?.boardId)}`,
    `sprint=${normalizeSelectionPart(selection?.sprintId)}`,
    `filter=${normalizeSelectionPart(selection?.filterId)}`,
  ].join(":");
}

export function buildPersistedSelectionKeys(input: {
  readonly requestSelection?: T3workBacklogSelectionInput;
  readonly response: T3workAtlassianBacklogPayload;
}): ReadonlyArray<string> {
  const requestKey = buildBacklogSelectionKey(input.requestSelection);
  const resolvedKey = buildBacklogSelectionKey({
    ...(input.response.selectedBoardId ? { boardId: input.response.selectedBoardId } : {}),
    ...(input.response.selectedSprintId ? { sprintId: input.response.selectedSprintId } : {}),
    ...(input.response.selectedFilterId ? { filterId: input.response.selectedFilterId } : {}),
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

export function fingerprintBacklogPayload(payload: T3workAtlassianBacklogPayload): string {
  return createT3workPollFingerprint(payload);
}

export function materializeBacklogPayload(input: {
  readonly row: BacklogViewRow;
  readonly issueRows: ReadonlyArray<BacklogIssueRow>;
}): T3workAtlassianBacklogPayload | null {
  const issueIds = parseJson<ReadonlyArray<string>>(input.row.issueIdsJson);
  const boards = parseJson<ReadonlyArray<AtlassianBacklogBoard>>(input.row.boardsJson);
  const sprints = parseJson<ReadonlyArray<AtlassianBacklogSprint>>(input.row.sprintsJson);
  const savedFilters = parseJson<ReadonlyArray<AtlassianBacklogSavedFilter>>(
    input.row.savedFiltersJson,
  );
  const capabilities = parseJson<T3workAtlassianBacklogCapabilities>(input.row.capabilitiesJson);
  if (!issueIds || !boards || !sprints || !savedFilters || !capabilities) {
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
    ...(input.row.selectedBoardId ? { selectedBoardId: input.row.selectedBoardId } : {}),
    ...(input.row.selectedSprintId ? { selectedSprintId: input.row.selectedSprintId } : {}),
    ...(input.row.selectedFilterId ? { selectedFilterId: input.row.selectedFilterId } : {}),
  };
}
