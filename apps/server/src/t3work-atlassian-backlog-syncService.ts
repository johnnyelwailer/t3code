import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import { appendCachedT3workAtlassianBacklogSyncPage } from "./t3work-atlassian-backlog-cacheReadWrite.ts";
import { readCachedBacklogViewRow } from "./t3work-atlassian-backlog-cacheQueries.ts";
import {
  buildBacklogSelectionKey,
  type BacklogResourceRef,
  type T3workBacklogSelectionInput,
} from "./t3work-atlassian-backlog-cacheShared.ts";
import { tryAtlassianPromise } from "./t3work-atlassian-http.ts";

const syncPageSize = 100;
const maxPagesPerBurst = 10;
const burstPause = "3 seconds";
// Runaway guard: a walk never fetches more pages than this, even if the
// provider keeps handing out continuation tokens.
const maxPagesPerWalk = 100;

type ActiveBacklogSync = {
  readonly selectionKey: string;
  readonly token: symbol;
};

// One walk per (provider, account, project). A newer selection supersedes the
// in-flight walk for the same project: the old fiber notices its token is no
// longer registered and stops between pages.
const activeBacklogSyncs = new Map<string, ActiveBacklogSync>();

function backlogSyncMapKey(input: {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
}): string {
  return `${input.account.provider}|${input.account.id}|${input.externalProjectId}`;
}

export type T3workAtlassianBacklogSyncRequest = {
  readonly provider: AtlassianIntegrationProvider;
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
  readonly selection: T3workBacklogSelectionInput;
};

/**
 * Background page-sync for a backlog selection (doc 04, "Backlog Sync Contract").
 *
 * Continues paging the selection from its persisted cursor checkpoint into the
 * SQLite cache, bounded by per-burst budgets, until the provider reports no
 * more pages. On completion the view's id list is replaced with exactly the
 * ids seen during the walk, pruning issues that no longer match the filter.
 * Clients observe progress through the existing fingerprint polling.
 */
export function kickT3workAtlassianBacklogBackgroundSync(input: T3workAtlassianBacklogSyncRequest) {
  const mapKey = backlogSyncMapKey(input);
  const selectionKey = buildBacklogSelectionKey(input.selection);
  const existing = activeBacklogSyncs.get(mapKey);
  if (existing?.selectionKey === selectionKey) {
    return Effect.void;
  }

  const token = Symbol(selectionKey);
  activeBacklogSyncs.set(mapKey, { selectionKey, token });

  const isSuperseded = () => activeBacklogSyncs.get(mapKey)?.token !== token;
  const unregister = Effect.sync(() => {
    if (activeBacklogSyncs.get(mapKey)?.token === token) {
      activeBacklogSyncs.delete(mapKey);
    }
  });

  return runBacklogSyncWalk(input, isSuperseded).pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("t3work atlassian backlog background sync failed", cause),
    ),
    Effect.ensuring(unregister),
    Effect.forkDetach,
    Effect.asVoid,
  );
}

function runBacklogSyncWalk(
  input: T3workAtlassianBacklogSyncRequest,
  isSuperseded: () => boolean,
) {
  return Effect.gen(function* () {
    const identity = {
      provider: input.account.provider,
      accountId: input.account.id,
      externalProjectId: input.externalProjectId,
    };
    const requestSelectionKey = buildBacklogSelectionKey(input.selection);

    const viewRow = yield* readCachedBacklogViewRow({
      ...identity,
      selection: input.selection,
    });
    if (!viewRow?.pageNextCursor) {
      return;
    }

    // The selection's saved-filter JQL is only known after resolving the
    // selection against the provider; one extra call per walk.
    const resolved = yield* tryAtlassianPromise(
      () =>
        input.provider.getBacklogSelection({
          account: input.account,
          externalProjectId: input.externalProjectId,
          ...(input.selection.boardId ? { boardId: input.selection.boardId } : {}),
          ...(input.selection.sprintId ? { sprintId: input.selection.sprintId } : {}),
          ...(input.selection.filterId ? { filterId: input.selection.filterId } : {}),
        }),
      "Failed to resolve Atlassian backlog selection for background sync.",
    );
    const resolvedSelectionKey = buildBacklogSelectionKey({
      ...(resolved.selectedBoardId ? { boardId: resolved.selectedBoardId } : {}),
      ...(resolved.selectedSprintId ? { sprintId: resolved.selectedSprintId } : {}),
      ...(resolved.selectedFilterId ? { filterId: resolved.selectedFilterId } : {}),
    });
    const selectionKeys =
      requestSelectionKey === resolvedSelectionKey
        ? [requestSelectionKey]
        : [requestSelectionKey, resolvedSelectionKey];

    // The provider's continuation cursor is an opaque Jira nextPageToken, so a
    // walk cannot resume from the persisted checkpoint after a restart — the
    // checkpoint only marks the view as incomplete. Walk from page 1; already
    // cached issues are cheap upserts and the complete walkIds list lets the
    // final write prune issues that no longer match the selection.
    const walkIds: string[] = [];
    const walkIdSet = new Set<string>();
    let cursor: string | undefined;
    let pagesThisBurst = 0;
    let pagesThisWalk = 0;

    while (pagesThisWalk < maxPagesPerWalk) {
      if (isSuperseded()) {
        return;
      }
      if (pagesThisBurst >= maxPagesPerBurst) {
        pagesThisBurst = 0;
        yield* Effect.sleep(burstPause);
        continue;
      }

      const page = yield* tryAtlassianPromise(
        () =>
          input.provider.listBacklogResources({
            account: input.account,
            externalProjectId: input.externalProjectId,
            limit: syncPageSize,
            ...(cursor ? { cursor } : {}),
            ...(resolved.selectedBoardId ? { boardId: resolved.selectedBoardId } : {}),
            ...(resolved.selectedSprintId ? { sprintId: resolved.selectedSprintId } : {}),
            ...(resolved.selectedFilterJql ? { filterJql: resolved.selectedFilterJql } : {}),
          }),
        "Failed to sync Atlassian backlog page.",
      );
      pagesThisBurst += 1;
      pagesThisWalk += 1;

      const items = page.items as ReadonlyArray<BacklogResourceRef>;
      for (const item of items) {
        if (!walkIdSet.has(item.id)) {
          walkIdSet.add(item.id);
          walkIds.push(item.id);
        }
      }
      const nextCursor = page.nextCursor ?? null;

      if (isSuperseded()) {
        return;
      }
      yield* appendCachedT3workAtlassianBacklogSyncPage({
        ...identity,
        selectionKeys,
        items,
        cursor: {
          next: nextCursor,
          ...(page.totalCount !== undefined ? { totalCount: page.totalCount } : {}),
        },
        ...(nextCursor === null ? { replaceIssueIds: walkIds } : {}),
      });

      if (nextCursor === null) {
        return;
      }
      cursor = nextCursor;
    }
  });
}
