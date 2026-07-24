import * as Clock from "effect/Clock";
import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";

import {
  writeCachedT3TeamAtlassianBacklog,
  type T3TeamAtlassianBacklogPayload,
  type T3TeamBacklogSelectionInput,
} from "./t3team-atlassian-backlog-cache.ts";
import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import { tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import {
  type T3TeamAtlassianBoardColumnsInput,
  type T3TeamAtlassianBacklogInput,
} from "./t3team-atlassian-backlogTypes.ts";
import {
  createLiveT3TeamAtlassianBacklogResponse,
  readCachedT3TeamAtlassianBacklogResponse,
} from "./t3team-atlassian-backlogCachedResponse.ts";
import { loadLiveBacklogPayload, loadSelection } from "./t3team-atlassian-backlogLivePayload.ts";
import { kickT3TeamAtlassianBacklogBackgroundSync } from "./t3team-atlassian-backlog-syncService.ts";
import { kickT3TeamAtlassianBacklogMetadataRefresh } from "./t3team-atlassian-backlog-metadataRefresh.ts";

export function loadT3TeamAtlassianBoardColumns(input: T3TeamAtlassianBoardColumnsInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.account.id);

    if (!(provider instanceof AtlassianIntegrationProvider)) {
      return {
        availableStatuses: [],
        boardColumns: [],
      };
    }

    const selection = yield* loadSelection(provider, {
      account: input.account,
      externalProjectId: input.externalProjectId,
      ...(input.boardId ? { boardId: input.boardId } : {}),
    });
    const availableStatuses = yield* tryAtlassianPromise(
      () =>
        provider.listProjectStatuses({
          account: input.account,
          externalProjectId: input.externalProjectId,
        }),
      "Failed to load Atlassian project statuses.",
    ).pipe(Effect.catch(() => Effect.succeed([])));

    return {
      ...(selection.selectedBoardId ? { selectedBoardId: selection.selectedBoardId } : {}),
      availableStatuses,
      boardColumns: selection.selectedBoardColumns ?? [],
    };
  });
}

export function loadT3TeamAtlassianBacklog(input: T3TeamAtlassianBacklogInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.account.id);
    const requestSelection: T3TeamBacklogSelectionInput = {
      ...(input.boardId ? { boardId: input.boardId } : {}),
      ...(input.sprintId ? { sprintId: input.sprintId } : {}),
      ...(input.filterId ? { filterId: input.filterId } : {}),
      ...(input.quickFilterIds && input.quickFilterIds.length > 0
        ? { quickFilterIds: input.quickFilterIds }
        : {}),
    };

    if (!(provider instanceof AtlassianIntegrationProvider)) {
      const page = yield* tryAtlassianPromise(
        () =>
          provider.listResources({
            account: input.account,
            externalProjectId: input.externalProjectId,
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
          }),
        "Failed to load Atlassian backlog.",
      );
      const payload = {
        page,
        capabilities: { canCreateSubtasks: false },
        boards: [],
        sprints: [],
        savedFilters: [],
        quickFilters: [],
      } satisfies T3TeamAtlassianBacklogPayload;

      return createLiveT3TeamAtlassianBacklogResponse({
        payload,
        updatedAt: yield* Clock.currentTimeMillis,
      });
    }

    if (!input.forceRefresh) {
      const cachedResponse = yield* readCachedT3TeamAtlassianBacklogResponse({
        provider: input.account.provider,
        accountId: input.account.id,
        externalProjectId: input.externalProjectId,
        selection: requestSelection,
        source: "persisted",
      });
      if (cachedResponse) {
        if (cachedResponse.page.nextCursor) {
          // A previous sync walk is unfinished (or the server restarted
          // mid-walk); resume it so the full backlog eventually lands.
          yield* kickT3TeamAtlassianBacklogBackgroundSync({
            provider,
            account: input.account,
            externalProjectId: input.externalProjectId,
            selection: requestSelection,
          });
        }
        const cachedSelectedBoardId = cachedResponse.selectedBoardId ?? requestSelection.boardId;
        if (cachedSelectedBoardId && cachedResponse.quickFilters.length === 0) {
          // Quick filters were persisted empty, most likely because Jira
          // rate-limited the original fetch. Since the cache is otherwise
          // valid, nothing would ever re-resolve the selection — self-heal
          // with a throttled, single-flight background refresh instead.
          yield* kickT3TeamAtlassianBacklogMetadataRefresh({
            account: input.account,
            externalProjectId: input.externalProjectId,
            selection: { ...requestSelection, boardId: cachedSelectedBoardId },
          });
        }
        return cachedResponse;
      }
    }

    const livePayload = yield* loadLiveBacklogPayload(provider, input).pipe(
      Effect.catch((cause) =>
        Effect.gen(function* () {
          const cachedResponse = yield* readCachedT3TeamAtlassianBacklogResponse({
            provider: input.account.provider,
            accountId: input.account.id,
            externalProjectId: input.externalProjectId,
            selection: requestSelection,
            source: "stale-fallback",
          });
          if (!cachedResponse) {
            return yield* cause;
          }
          return cachedResponse;
        }),
      ),
    );

    if ("cache" in livePayload) {
      return livePayload;
    }

    const cacheRecord = yield* writeCachedT3TeamAtlassianBacklog({
      provider: input.account.provider,
      accountId: input.account.id,
      externalProjectId: input.externalProjectId,
      requestSelection,
      response: livePayload,
      mergeExistingTail: true,
      ...(input.clearProjectCache ? { replaceProjectCache: true } : {}),
    }).pipe(
      Effect.catch(() =>
        Effect.gen(function* () {
          const response = createLiveT3TeamAtlassianBacklogResponse({
            payload: livePayload,
            updatedAt: yield* Clock.currentTimeMillis,
          });
          return {
            updatedAt: response.cache.updatedAt,
            fingerprint: response.cache.fingerprint,
            response: livePayload,
          };
        }),
      ),
    );

    if (cacheRecord.response.page.nextCursor) {
      yield* kickT3TeamAtlassianBacklogBackgroundSync({
        provider,
        account: input.account,
        externalProjectId: input.externalProjectId,
        selection: requestSelection,
      });
    }

    return createLiveT3TeamAtlassianBacklogResponse({
      payload: cacheRecord.response,
      updatedAt: cacheRecord.updatedAt,
      fingerprint: cacheRecord.fingerprint,
    });
  });
}
