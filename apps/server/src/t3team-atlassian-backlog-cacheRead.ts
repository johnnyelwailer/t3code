import * as Effect from "effect/Effect";

import { toPersistenceSqlError } from "./persistence/Errors.ts";
import {
  readCachedBacklogIssueRows,
  readCachedBacklogViewRow,
} from "./t3team-atlassian-backlog-cacheQueries.ts";
import {
  fingerprintBacklogPayload,
  materializeBacklogPayload,
  type T3TeamBacklogCacheIdentity,
  type T3TeamBacklogSelectionInput,
  type T3TeamCachedAtlassianBacklogRecord,
} from "./t3team-atlassian-backlog-cacheShared.ts";
import { ensureBacklogCacheTables } from "./t3team-atlassian-backlog-cacheTables.ts";

export const readCachedT3TeamAtlassianBacklog = Effect.fn("t3team.atlassianBacklogCache.read")(
  function* (
    input: T3TeamBacklogCacheIdentity & {
      readonly selection?: T3TeamBacklogSelectionInput;
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
      } satisfies T3TeamCachedAtlassianBacklogRecord;
    }).pipe(Effect.mapError(toPersistenceSqlError("t3team.atlassianBacklogCache.read")));
  },
);
