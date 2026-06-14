import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import type { IntegrationAccountRef } from "@t3tools/integrations-core";
import * as Effect from "effect/Effect";

import { providerForAccount } from "./t3work-atlassian-auth-store.ts";
import { appendCachedT3workAtlassianBacklogSyncPage } from "./t3work-atlassian-backlog-cacheReadWrite.ts";
import { readCachedBacklogIssueRows } from "./t3work-atlassian-backlog-cacheQueries.ts";
import {
  buildBacklogSelectionKey,
  parseJson,
  type BacklogResourceRef,
} from "./t3work-atlassian-backlog-cacheShared.ts";
import { ensureBacklogCacheTables } from "./t3work-atlassian-backlog-cacheTables.ts";
import { loadSelection } from "./t3work-atlassian-backlogLivePayload.ts";
import { tryAtlassianPromise } from "./t3work-atlassian-http.ts";

const defaultBacklogSearchLimit = 50;

export type T3workAtlassianBacklogSearchInput = {
  readonly account: IntegrationAccountRef;
  readonly externalProjectId: string;
  readonly query: string;
  /** "offline" searches the local SQLite cache only; "live" queries the
   * provider (scoped to the selection) and persists hits into the cache. */
  readonly mode: "offline" | "live";
  readonly boardId?: string;
  readonly sprintId?: string;
  readonly filterId?: string;
  readonly limit?: number;
};

export type T3workAtlassianBacklogSearchResult = {
  readonly mode: "offline" | "live";
  readonly items: ReadonlyArray<BacklogResourceRef>;
};

function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function backlogIssueSearchHaystack(item: BacklogResourceRef): string {
  const record = item as Record<string, unknown>;
  return [
    item.displayId,
    item.title,
    record.description,
    record.status,
    record.assignee,
    record.issueType,
    record.type,
    record.sprintName,
    record.sprintGoal,
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .toLowerCase();
}

// Escape for embedding inside a quoted JQL string; Jira treats the value as a
// full-text term, so stripping quotes/backslashes is enough to stay valid.
function toJqlTextTerm(query: string): string {
  return query.trim().replace(/[\\"]/g, " ").replace(/\s+/g, " ").trim();
}

export function searchT3workAtlassianBacklog(input: T3workAtlassianBacklogSearchInput) {
  return input.mode === "offline"
    ? searchOfflineBacklogCache(input)
    : searchLiveBacklog(input);
}

export function searchOfflineBacklogCache(input: T3workAtlassianBacklogSearchInput) {
  return Effect.gen(function* () {
    const normalizedQuery = normalizeSearchQuery(input.query);
    if (!normalizedQuery) {
      return { mode: "offline", items: [] } satisfies T3workAtlassianBacklogSearchResult;
    }

    yield* ensureBacklogCacheTables();
    const rows = yield* readCachedBacklogIssueRows({
      provider: input.account.provider,
      accountId: input.account.id,
      externalProjectId: input.externalProjectId,
    });

    const limit = input.limit ?? defaultBacklogSearchLimit;
    const items: BacklogResourceRef[] = [];
    for (const row of rows) {
      const item = parseJson<BacklogResourceRef>(row.resourceJson);
      if (!item) {
        continue;
      }
      if (backlogIssueSearchHaystack(item).includes(normalizedQuery)) {
        items.push(item);
        if (items.length >= limit) {
          break;
        }
      }
    }

    return { mode: "offline", items } satisfies T3workAtlassianBacklogSearchResult;
  }).pipe(
    Effect.catch(() =>
      Effect.succeed({ mode: "offline", items: [] } satisfies T3workAtlassianBacklogSearchResult),
    ),
  );
}

function searchLiveBacklog(input: T3workAtlassianBacklogSearchInput) {
  return Effect.gen(function* () {
    const textTerm = toJqlTextTerm(input.query);
    if (!textTerm) {
      return { mode: "live", items: [] } satisfies T3workAtlassianBacklogSearchResult;
    }

    const provider = yield* providerForAccount(input.account.id);
    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return { mode: "live", items: [] } satisfies T3workAtlassianBacklogSearchResult;
    }

    const selection = yield* loadSelection(provider, {
      account: input.account,
      externalProjectId: input.externalProjectId,
      ...(input.boardId ? { boardId: input.boardId } : {}),
      ...(input.sprintId ? { sprintId: input.sprintId } : {}),
      ...(input.filterId ? { filterId: input.filterId } : {}),
    });

    const textClause = `text ~ "${textTerm}"`;
    const filterJql = selection.selectedFilterJql
      ? `(${selection.selectedFilterJql}) AND ${textClause}`
      : textClause;

    const page = yield* tryAtlassianPromise(
      () =>
        provider.listBacklogResources({
          account: input.account,
          externalProjectId: input.externalProjectId,
          limit: input.limit ?? defaultBacklogSearchLimit,
          filterJql,
          ...(selection.selectedBoardId ? { boardId: selection.selectedBoardId } : {}),
          ...(selection.selectedSprintId ? { sprintId: selection.selectedSprintId } : {}),
        }),
      "Failed to search the Atlassian backlog.",
    );
    const items = page.items as ReadonlyArray<BacklogResourceRef>;

    // Search hits match the selection's own filters, so they belong in the
    // cached view: persist them (preserving the sync cursor checkpoint) so
    // they're available offline and survive until the next full sync walk.
    if (items.length > 0) {
      const requestSelectionKey = buildBacklogSelectionKey({
        ...(input.boardId ? { boardId: input.boardId } : {}),
        ...(input.sprintId ? { sprintId: input.sprintId } : {}),
        ...(input.filterId ? { filterId: input.filterId } : {}),
      });
      const resolvedSelectionKey = buildBacklogSelectionKey({
        ...(selection.selectedBoardId ? { boardId: selection.selectedBoardId } : {}),
        ...(selection.selectedSprintId ? { sprintId: selection.selectedSprintId } : {}),
        ...(selection.selectedFilterId ? { filterId: selection.selectedFilterId } : {}),
      });
      yield* appendCachedT3workAtlassianBacklogSyncPage({
        provider: input.account.provider,
        accountId: input.account.id,
        externalProjectId: input.externalProjectId,
        selectionKeys:
          requestSelectionKey === resolvedSelectionKey
            ? [requestSelectionKey]
            : [requestSelectionKey, resolvedSelectionKey],
        items,
      }).pipe(Effect.catch(() => Effect.void));
    }

    return { mode: "live", items } satisfies T3workAtlassianBacklogSearchResult;
  });
}
