import type { AtlassianBacklogResponse } from "~/t3work/backend/t3work-types";

import type { BacklogSelectionInput } from "./t3work-projectBacklogCache";

const AUTO_FORCE_REFRESH_FAILURE_BASE_MS = 5_000;
const AUTO_FORCE_REFRESH_FAILURE_MAX_MS = 60_000;

export type BacklogLoadOptions = {
  readonly forceRefresh?: boolean;
  readonly clearProjectCache?: boolean;
  readonly silent?: boolean;
  readonly suppressError?: boolean;
};

function normalizeSelectionKeyPart(value?: string): string {
  return value?.trim().length ? value.trim() : "default";
}

export function buildProjectBacklogSelectionKey(selection?: BacklogSelectionInput): string {
  return [
    `board=${normalizeSelectionKeyPart(selection?.boardId)}`,
    `sprint=${normalizeSelectionKeyPart(selection?.sprintId)}`,
    `filter=${normalizeSelectionKeyPart(selection?.filterId)}`,
    `quickFilters=${
      selection?.selectedQuickFilterIds?.length
        ? [...selection.selectedQuickFilterIds].sort().join(",")
        : "default"
    }`,
  ].join(":");
}

export function buildProjectBacklogRequestKey(
  selection?: BacklogSelectionInput,
  options?: Pick<BacklogLoadOptions, "forceRefresh" | "clearProjectCache" | "silent">,
): string {
  return [
    buildProjectBacklogSelectionKey(selection),
    options?.forceRefresh ? "refresh" : "cached",
    options?.clearProjectCache ? "clear" : "keep",
    options?.silent ? "silent" : "visible",
  ].join(":");
}

export function buildProjectBacklogAutoRefreshKey(
  selection: BacklogSelectionInput | undefined,
  fingerprint: string,
): string {
  return `${buildProjectBacklogSelectionKey(selection)}:${fingerprint}`;
}

export function nextProjectBacklogAutoRefreshBackoffMs(previousMs: number): number {
  return Math.min(
    previousMs > 0 ? previousMs * 2 : AUTO_FORCE_REFRESH_FAILURE_BASE_MS,
    AUTO_FORCE_REFRESH_FAILURE_MAX_MS,
  );
}

export function shouldAutoRefreshPersistedProjectBacklog(input: {
  readonly cacheSource: AtlassianBacklogResponse["cache"] extends infer T
    ? T extends { source?: infer S }
      ? S
      : undefined
    : undefined;
  readonly selection?: BacklogSelectionInput;
  readonly fingerprint: string;
  readonly forceRefresh?: boolean;
  readonly nowMs: number;
  readonly cooldownUntilMs: number;
  readonly lastAutoRefreshKey: string | null;
  readonly inFlightRequestKey: string | null;
}): boolean {
  if (input.forceRefresh || input.cacheSource !== "persisted") {
    return false;
  }

  if (input.nowMs < input.cooldownUntilMs) {
    return false;
  }

  const autoRefreshKey = buildProjectBacklogAutoRefreshKey(input.selection, input.fingerprint);
  if (input.lastAutoRefreshKey === autoRefreshKey) {
    return false;
  }

  return (
    input.inFlightRequestKey !==
    buildProjectBacklogRequestKey(input.selection, { forceRefresh: true, silent: true })
  );
}

export function shouldPollProjectBacklog(input: {
  readonly options?: BacklogLoadOptions;
  readonly fingerprint: string | null;
  readonly pollingAvailable: boolean;
}): boolean {
  return Boolean(
    input.options?.forceRefresh &&
    input.options?.silent &&
    !input.options?.clearProjectCache &&
    input.fingerprint &&
    input.pollingAvailable,
  );
}

export function shouldSkipProjectBacklogSelectionSyncReload(input: {
  readonly hasLoadedResponse: boolean;
  readonly syncedRequestKey: string | null;
  readonly nextRequestKey: string;
}): boolean {
  return input.hasLoadedResponse && input.syncedRequestKey === input.nextRequestKey;
}
