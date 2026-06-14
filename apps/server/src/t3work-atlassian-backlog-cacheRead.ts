import * as Effect from "effect/Effect";

import { toPersistenceSqlError } from "./persistence/Errors.ts";
import {
  readCachedBacklogIssueRows,
  readCachedBacklogViewRow,
} from "./t3work-atlassian-backlog-cacheQueries.ts";
import {
  fingerprintBacklogPayload,
  materializeBacklogPayload,
  type T3workBacklogCacheIdentity,
  type T3workBacklogSelectionInput,
  type T3workCachedAtlassianBacklogRecord,
} from "./t3work-atlassian-backlog-cacheShared.ts";
import { ensureBacklogCacheTables } from "./t3work-atlassian-backlog-cacheTables.ts";

export const readCachedT3workAtlassianBacklog = Effect.fn("t3work.atlassianBacklogCache.read")(
  function* (
    input: T3workBacklogCacheIdentity & {
      readonly selection?: T3workBacklogSelectionInput;
    },
  ) {
    return yield* Effect.gen(function* () {
      yield* ensureBacklogCacheTables();
      const resolvedRow = yield* readCachedBacklogViewRow(input);
      if (!resolvedRow) {
        return null;
      }

      const issueRows = yield* readCachedBacklogIssueRows(input);

      const response = materializeBacklogPayload({ row: resolvedRow, issueRows });
      if (!response) {
        return null;
      }

      return {
        response,
        updatedAt: resolvedRow.updatedAt,
        fingerprint: fingerprintBacklogPayload(response),
      } satisfies T3workCachedAtlassianBacklogRecord;
    }).pipe(Effect.mapError(toPersistenceSqlError("t3work.atlassianBacklogCache.read")));
  },
);
