import type { PackCollectionsDefinition } from "@t3team/pack-api";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/sql/SqlClient";
import { type packDocumentWriter, removedChanges } from "./t3team-packDocumentCommit.ts";
import { packDocumentRetentionPass } from "./t3team-packDocumentRetention.ts";

/** One retention pass per registered pack; a failing pack is logged and does not stop the rest. */
export const packDocumentRetentionSweep = (
  sql: SqlClient.SqlClient,
  configs: ReadonlyMap<string, PackCollectionsDefinition>,
  write: ReturnType<typeof packDocumentWriter>,
): Effect.Effect<void> =>
  Effect.forEach(
    configs,
    ([packId, config]) =>
      write(
        "retention",
        DateTime.now.pipe(
          Effect.flatMap((time) => packDocumentRetentionPass(sql, packId, config, time)),
          Effect.map((result) => ({
            value: result,
            changes: removedChanges(packId, result.removed),
          })),
        ),
      ).pipe(
        Effect.flatMap(({ removed, overQuotaBytes }) =>
          Effect.all([
            removed.length === 0
              ? Effect.void
              : Effect.logInfo("t3team.packDocuments.retention-removed", {
                  packId,
                  documents: removed.length,
                }),
            overQuotaBytes === 0
              ? Effect.void
              : Effect.logWarning("t3team.packDocuments.over-quota", { packId, overQuotaBytes }),
          ]),
        ),
        Effect.catch((cause) =>
          Effect.logWarning("t3team.packDocuments.retention-failed", { packId, cause }),
        ),
      ),
    { discard: true },
  );
