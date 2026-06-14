import * as Clock from "effect/Clock";
import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";

import {
  writeCachedT3workAtlassianBacklog,
  type T3workAtlassianBacklogPayload,
  type T3workBacklogSelectionInput,
} from "./t3work-atlassian-backlog-cache.ts";
import { providerForAccount } from "./t3work-atlassian-auth-store.ts";
import { tryAtlassianPromise } from "./t3work-atlassian-http.ts";
import {
  type T3workAtlassianBoardColumnsInput,
  type T3workAtlassianBacklogInput,
} from "./t3work-atlassian-backlogTypes.ts";
import {
  createLiveT3workAtlassianBacklogResponse,
  readCachedT3workAtlassianBacklogResponse,
} from "./t3work-atlassian-backlogCachedResponse.ts";
import { loadLiveBacklogPayload, loadSelection } from "./t3work-atlassian-backlogLivePayload.ts";
import { kickT3workAtlassianBacklogBackgroundSync } from "./t3work-atlassian-backlog-syncService.ts";

export function loadT3workAtlassianBoardColumns(input: T3workAtlassianBoardColumnsInput) {
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

export function loadT3workAtlassianBacklog(input: T3workAtlassianBacklogInput) {
  return Effect.gen(function* () {
    const provider = yield* providerForAccount(input.account.id);
    const requestSelection: T3workBacklogSelectionInput = {
      ...(input.boardId ? { boardId: input.boardId } : {}),
      ...(input.sprintId ? { sprintId: input.sprintId } : {}),
      ...(input.filterId ? { filterId: input.filterId } : {}),
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
      } satisfies T3workAtlassianBacklogPayload;

      return createLiveT3workAtlassianBacklogResponse({
        payload,
        updatedAt: yield* Clock.currentTimeMillis,
      });
    }

    if (!input.forceRefresh) {
      const cachedResponse = yield* readCachedT3workAtlassianBacklogResponse({
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
          yield* kickT3workAtlassianBacklogBackgroundSync({
            provider,
            account: input.account,
            externalProjectId: input.externalProjectId,
            selection: requestSelection,
          });
        }
        return cachedResponse;
      }
    }

    const livePayload = yield* loadLiveBacklogPayload(provider, input).pipe(
      Effect.catch((cause) =>
        Effect.gen(function* () {
          const cachedResponse = yield* readCachedT3workAtlassianBacklogResponse({
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

    const cacheRecord = yield* writeCachedT3workAtlassianBacklog({
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
          const response = createLiveT3workAtlassianBacklogResponse({
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
      yield* kickT3workAtlassianBacklogBackgroundSync({
        provider,
        account: input.account,
        externalProjectId: input.externalProjectId,
        selection: requestSelection,
      });
    }

    return createLiveT3workAtlassianBacklogResponse({
      payload: cacheRecord.response,
      updatedAt: cacheRecord.updatedAt,
      fingerprint: cacheRecord.fingerprint,
    });
  });
}
