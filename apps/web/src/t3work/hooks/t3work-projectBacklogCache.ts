import type {
  AtlassianAssignableUser,
  AtlassianBacklogResponse,
} from "~/t3work/backend/t3work-types";

export const ATLASSIAN_BACKLOG_POLL_INTERVAL_MS = 90_000;
export const ATLASSIAN_BACKLOG_CACHE_MAX_AGE_MS = 90_000;
// While the server-side background sync is still paging a selection
// (response.page.nextCursor set), poll fast so new pages stream into the UI.
export const ATLASSIAN_BACKLOG_SYNC_POLL_INTERVAL_MS = 4_000;
const LEGACY_BACKLOG_CACHE_STORAGE_PREFIX = "t3work.integration-cache.v1:atlassian:backlog:";

type StorageLike = Pick<Storage, "length" | "key" | "removeItem">;

export const DEFAULT_PROJECT_BACKLOG_CAPABILITIES = {
  canCreateSubtasks: false,
} satisfies AtlassianBacklogResponse["capabilities"];

export type BacklogSelectionInput = {
  boardId?: string | undefined;
  sprintId?: string | undefined;
  filterId?: string | undefined;
};

type BacklogResourceRef = AtlassianBacklogResponse["page"]["items"][number] & {
  assigneeAccountId?: string;
  estimateValue?: number;
  timeOriginalEstimateSeconds?: number;
  timeRemainingEstimateSeconds?: number;
  aggregateTimeOriginalEstimateSeconds?: number;
  aggregateTimeRemainingEstimateSeconds?: number;
  subtaskCount?: number;
};

export function purgeLegacyProjectBacklogLocalCache(storage?: StorageLike): void {
  const targetStorage =
    storage ??
    (typeof window !== "undefined" && typeof window.localStorage !== "undefined"
      ? window.localStorage
      : undefined);
  if (!targetStorage) {
    return;
  }

  const keysToDelete: string[] = [];
  for (let index = 0; index < targetStorage.length; index += 1) {
    const key = targetStorage.key(index);
    if (!key || !key.startsWith(LEGACY_BACKLOG_CACHE_STORAGE_PREFIX)) {
      continue;
    }
    keysToDelete.push(key);
  }

  for (const key of keysToDelete) {
    targetStorage.removeItem(key);
  }
}

export function fingerprintProjectBacklog(response: AtlassianBacklogResponse): string {
  if (response.cache?.fingerprint) {
    return response.cache.fingerprint;
  }

  const { cache: _cache, ...payload } = response;
  return JSON.stringify(payload);
}

function patchProjectBacklogItem(
  response: AtlassianBacklogResponse,
  issueIdOrKey: string,
  patch: (item: BacklogResourceRef) => BacklogResourceRef,
): AtlassianBacklogResponse {
  let changed = false;
  const items = response.page.items.map((item) => {
    if (item.id !== issueIdOrKey && item.displayId !== issueIdOrKey) {
      return item;
    }
    changed = true;
    return patch(item as BacklogResourceRef);
  });

  if (!changed) {
    return response;
  }

  return {
    ...response,
    page: {
      ...response.page,
      items,
    },
  };
}

export function updateProjectBacklogAssigneeResponse(
  response: AtlassianBacklogResponse,
  issueIdOrKey: string,
  assignee: AtlassianAssignableUser | null,
): AtlassianBacklogResponse {
  return patchProjectBacklogItem(response, issueIdOrKey, (item) => {
    if (!assignee) {
      const { assignee: _assignee, assigneeAccountId: _assigneeAccountId, ...rest } = item;
      return rest;
    }

    return {
      ...item,
      assignee: assignee.displayName,
      assigneeAccountId: assignee.accountId,
    };
  });
}

export function updateProjectBacklogEstimateResponse(
  response: AtlassianBacklogResponse,
  issueIdOrKey: string,
  estimateValue: number | null,
  options: {
    mode: "points" | "hours";
    estimateFieldLabel?: string;
  },
): AtlassianBacklogResponse {
  const nextResponse = patchProjectBacklogItem(response, issueIdOrKey, (item) => {
    if (estimateValue === null) {
      if (options.mode === "hours") {
        const {
          estimateValue: _estimateValue,
          timeOriginalEstimateSeconds: _timeOriginalEstimateSeconds,
          ...rest
        } = item;
        return rest;
      }

      const { estimateValue: _estimateValue, ...rest } = item;
      return rest;
    }

    if (options.mode === "hours") {
      return {
        ...item,
        estimateValue,
        timeOriginalEstimateSeconds: Math.round(estimateValue * 3600),
      };
    }

    return {
      ...item,
      estimateValue,
    };
  });

  if (options.mode !== "points" || !options.estimateFieldLabel) {
    return nextResponse;
  }

  return {
    ...nextResponse,
    capabilities: {
      ...nextResponse.capabilities,
      estimateFieldLabel: options.estimateFieldLabel,
    },
  };
}

export function incrementProjectBacklogSubtaskCountResponse(
  response: AtlassianBacklogResponse,
  issueIdOrKey: string,
): AtlassianBacklogResponse {
  return patchProjectBacklogItem(response, issueIdOrKey, (item) => ({
    ...item,
    subtaskCount: (item.subtaskCount ?? 0) + 1,
  }));
}
