import {
  AtlassianIntegrationProvider,
  type AtlassianBacklogBoard,
  type AtlassianBacklogQuickFilter,
  type AtlassianBacklogSavedFilter,
  type AtlassianBacklogSprint,
} from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";

import {
  type T3workAtlassianBacklogCapabilities,
  type T3workAtlassianBacklogPayload,
} from "./t3work-atlassian-backlog-cache.ts";
import { T3workAtlassianError, tryAtlassianPromise } from "./t3work-atlassian-http.ts";
import type { T3workAtlassianBacklogInput } from "./t3work-atlassian-backlogTypes.ts";

export function loadSelection(
  provider: AtlassianIntegrationProvider,
  input: T3workAtlassianBacklogInput,
): Effect.Effect<
  {
    readonly boards: ReadonlyArray<AtlassianBacklogBoard>;
    readonly selectedBoardColumns?: ReadonlyArray<
      import("@t3tools/integrations-atlassian").AtlassianBacklogBoardColumn
    >;
    readonly sprints: ReadonlyArray<AtlassianBacklogSprint>;
    readonly savedFilters: ReadonlyArray<AtlassianBacklogSavedFilter>;
    readonly quickFilters: ReadonlyArray<AtlassianBacklogQuickFilter>;
    readonly selectedBoardId?: string;
    readonly selectedSprintId?: string;
    readonly selectedFilterId?: string;
    readonly selectedFilterJql?: string;
  },
  T3workAtlassianError
> {
  return tryAtlassianPromise(
    () =>
      provider.getBacklogSelection({
        account: input.account,
        externalProjectId: input.externalProjectId,
        ...(input.boardId ? { boardId: input.boardId } : {}),
        ...(input.sprintId ? { sprintId: input.sprintId } : {}),
        ...(input.filterId ? { filterId: input.filterId } : {}),
      }),
    "Failed to load Atlassian backlog board and sprint options.",
  ).pipe(
    Effect.catch(() =>
      Effect.succeed({
        boards: [],
        sprints: [],
        savedFilters: [],
        quickFilters: [],
        ...(input.boardId ? { selectedBoardId: input.boardId } : {}),
        ...(input.sprintId ? { selectedSprintId: input.sprintId } : {}),
        ...(input.filterId ? { selectedFilterId: input.filterId } : {}),
      }),
    ),
  );
}

export function loadLiveBacklogPayload(
  provider: AtlassianIntegrationProvider,
  input: T3workAtlassianBacklogInput,
): Effect.Effect<T3workAtlassianBacklogPayload, T3workAtlassianError> {
  return Effect.gen(function* () {
    const selection = yield* loadSelection(provider, input);
    const page = yield* tryAtlassianPromise(
      () =>
        provider.listBacklogResources({
          account: input.account,
          externalProjectId: input.externalProjectId,
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
          ...(selection.selectedBoardId ? { boardId: selection.selectedBoardId } : {}),
          ...(selection.selectedSprintId ? { sprintId: selection.selectedSprintId } : {}),
          ...(selection.selectedFilterJql ? { filterJql: selection.selectedFilterJql } : {}),
          ...(input.quickFilterIds && input.quickFilterIds.length > 0
            ? { quickFilterIds: input.quickFilterIds }
            : {}),
        }),
      "Failed to load Atlassian backlog.",
    );
    const capabilities = yield* tryAtlassianPromise(
      () =>
        provider.getBacklogCapabilities({
          account: input.account,
          externalProjectId: input.externalProjectId,
        }),
      "Failed to load Atlassian backlog capabilities.",
    ).pipe(
      Effect.catch(() =>
        Effect.succeed({ canCreateSubtasks: false } satisfies T3workAtlassianBacklogCapabilities),
      ),
    );

    return {
      page,
      capabilities,
      boards: selection.boards,
      sprints: selection.sprints,
      savedFilters: selection.savedFilters,
      quickFilters: selection.quickFilters,
      ...(selection.selectedBoardId ? { selectedBoardId: selection.selectedBoardId } : {}),
      ...(selection.selectedSprintId ? { selectedSprintId: selection.selectedSprintId } : {}),
      ...(selection.selectedFilterId ? { selectedFilterId: selection.selectedFilterId } : {}),
    } satisfies T3workAtlassianBacklogPayload;
  });
}
