import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3work-atlassian-auth-store.ts";
import { updateCachedBacklogViewMetadata } from "./t3work-atlassian-backlog-cache.ts";
import {
  buildBacklogSelectionKey,
  type T3workBacklogSelectionInput,
} from "./t3work-atlassian-backlog-cacheShared.ts";
import { tryAtlassianPromise } from "./t3work-atlassian-http.ts";

// Bounds re-fetch attempts for a selection whose persisted quick filters are
// empty (typically because Jira 429'd during the original fetch). Without
// this, a selection that genuinely has zero quick filters would otherwise be
// hammered on every cache hit.
export const metadataRefreshThrottleMs = 10 * 60 * 1000;

const lastMetadataRefreshAttempt = new Map<string, number>();

function metadataRefreshMapKey(input: {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
  readonly selection: T3workBacklogSelectionInput;
}): string {
  return [
    input.account.provider,
    input.account.id,
    input.externalProjectId,
    buildBacklogSelectionKey(input.selection),
  ].join("|");
}

/**
 * Pure throttle check: should a metadata refresh be attempted for this key
 * right now, given the last attempt timestamp (if any)? Exported for a cheap
 * unit test of the interval math.
 */
export function shouldAttemptMetadataRefresh(
  lastAttemptMs: number | undefined,
  nowMs: number,
  throttleMs = metadataRefreshThrottleMs,
): boolean {
  return lastAttemptMs === undefined || nowMs - lastAttemptMs >= throttleMs;
}

export type T3workAtlassianBacklogMetadataRefreshRequest = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
  readonly selection: T3workBacklogSelectionInput;
};

/**
 * Self-heals selection metadata (boards/sprints/saved filters/quick
 * filters/capabilities) for a persisted cache hit whose quick filters came
 * back empty — most often because the original fetch was rate-limited by
 * Jira. Fire-and-forget, single-flight and throttled per selection key so a
 * board that genuinely has zero quick filters costs at most one extra Jira
 * call every `metadataRefreshThrottleMs`.
 */
export function kickT3workAtlassianBacklogMetadataRefresh(
  input: T3workAtlassianBacklogMetadataRefreshRequest,
) {
  const mapKey = metadataRefreshMapKey(input);

  return Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    if (!shouldAttemptMetadataRefresh(lastMetadataRefreshAttempt.get(mapKey), now)) {
      return;
    }
    lastMetadataRefreshAttempt.set(mapKey, now);
    yield* runMetadataRefresh(input);
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("t3work atlassian backlog metadata refresh failed", cause),
    ),
    Effect.forkDetach,
    Effect.asVoid,
  );
}

function runMetadataRefresh(input: T3workAtlassianBacklogMetadataRefreshRequest) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.account.id);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return;
    }

    const requestSelectionKey = buildBacklogSelectionKey(input.selection);
    const resolved = yield* tryAtlassianPromise(
      () =>
        provider.getBacklogSelection({
          account: input.account,
          externalProjectId: input.externalProjectId,
          ...(input.selection.boardId ? { boardId: input.selection.boardId } : {}),
          ...(input.selection.sprintId ? { sprintId: input.selection.sprintId } : {}),
          ...(input.selection.filterId ? { filterId: input.selection.filterId } : {}),
        }),
      "Failed to refresh Atlassian backlog selection metadata.",
    );
    const resolvedSelectionKey = buildBacklogSelectionKey({
      ...(resolved.selectedBoardId ? { boardId: resolved.selectedBoardId } : {}),
      ...(resolved.selectedSprintId ? { sprintId: resolved.selectedSprintId } : {}),
      ...(resolved.selectedFilterId ? { filterId: resolved.selectedFilterId } : {}),
      ...(input.selection.quickFilterIds ? { quickFilterIds: input.selection.quickFilterIds } : {}),
    });
    const selectionKeys =
      requestSelectionKey === resolvedSelectionKey
        ? [requestSelectionKey]
        : [requestSelectionKey, resolvedSelectionKey];

    const capabilities = yield* tryAtlassianPromise(
      () =>
        provider.getBacklogCapabilities({
          account: input.account,
          externalProjectId: input.externalProjectId,
        }),
      "Failed to refresh Atlassian backlog capabilities.",
    ).pipe(Effect.catch(() => Effect.succeed({ canCreateSubtasks: false })));

    yield* updateCachedBacklogViewMetadata({
      provider: input.account.provider,
      accountId: input.account.id,
      externalProjectId: input.externalProjectId,
      selectionKeys,
      boards: resolved.boards,
      sprints: resolved.sprints,
      savedFilters: resolved.savedFilters,
      quickFilters: resolved.quickFilters,
      capabilities,
      ...(resolved.selectedBoardId ? { selectedBoardId: resolved.selectedBoardId } : {}),
      ...(resolved.selectedSprintId ? { selectedSprintId: resolved.selectedSprintId } : {}),
      ...(resolved.selectedFilterId ? { selectedFilterId: resolved.selectedFilterId } : {}),
    });
  });
}
