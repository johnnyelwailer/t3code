import type { PackCollectionDefinition, PackCollectionsDefinition } from "@t3team/pack-api";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as SqlClient from "effect/sql/SqlClient";
import { decodeRemovedRows, removedColumns } from "./t3team-packDocumentQueries.ts";

const decodeUsage = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ bytes: Schema.Number })),
);

const declaredCollections = (config: PackCollectionsDefinition) =>
  Object.entries(config).filter(
    (entry): entry is [string, PackCollectionDefinition] => typeof entry[1] === "object",
  );

/**
 * One retention pass for one pack; the caller owns the transaction and publishes the removals.
 * Order: expired documents, then each collection's own rule, then the pack quota, evicting the
 * least recently read documents first. `keep` collections are exempt from rules and eviction but
 * still count towards the quota, so `overQuotaBytes` reports what eviction could not free.
 * Collections the pack no longer declares are neither counted nor evicted.
 */
export const packDocumentRetentionPass = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  packId: string,
  config: PackCollectionsDefinition,
  time: DateTime.Utc,
) {
  const now = DateTime.formatIso(time);
  const removed = [
    ...(yield* sql`DELETE FROM t3team_pack_documents
      WHERE pack_id = ${packId} AND expires_at IS NOT NULL AND expires_at <= ${now}
      RETURNING ${sql.literal(removedColumns)}`.pipe(Effect.flatMap(decodeRemovedRows))),
  ];
  const collections = declaredCollections(config);
  for (const [collection, { retention }] of collections) {
    if (retention === "keep") continue;
    const unread = "afterUnreadDays" in retention;
    const days = unread ? retention.afterUnreadDays : retention.afterUpdateDays;
    const cutoff = DateTime.formatIso(DateTime.subtract(time, { days }));
    const column = sql.literal(unread ? "last_read_at" : "updated_at");
    removed.push(
      ...(yield* sql`DELETE FROM t3team_pack_documents
        WHERE pack_id = ${packId} AND collection = ${collection} AND ${column} < ${cutoff}
        RETURNING ${sql.literal(removedColumns)}`.pipe(Effect.flatMap(decodeRemovedRows))),
    );
  }
  const [usage] = yield* sql`SELECT COALESCE(SUM(byte_size), 0) AS bytes
    FROM t3team_pack_documents
    WHERE pack_id = ${packId} AND ${sql.in(
      "collection",
      collections.map(([name]) => name),
    )}`.pipe(Effect.flatMap(decodeUsage));
  const excess = (usage?.bytes ?? 0) - config.quotaBytes;
  const evictable = collections
    .filter(([, definition]) => definition.retention !== "keep")
    .map(([name]) => name);
  if (excess <= 0) return { removed, overQuotaBytes: 0 };
  if (evictable.length === 0) return { removed, overQuotaBytes: excess };
  // Running total in eviction order; a row goes while the bytes freed before it fall short.
  const evicted = yield* sql`DELETE FROM t3team_pack_documents
    WHERE pack_id = ${packId} AND (collection, doc_key) IN (
      SELECT collection, doc_key FROM (
        SELECT collection, doc_key, SUM(byte_size) OVER (
          ORDER BY last_read_at, collection, doc_key ROWS UNBOUNDED PRECEDING
        ) - byte_size AS freed_before
        FROM t3team_pack_documents
        WHERE pack_id = ${packId} AND ${sql.in("collection", evictable)}
      ) WHERE freed_before < ${excess}
    )
    RETURNING ${sql.literal(removedColumns)}`.pipe(Effect.flatMap(decodeRemovedRows));
  const freed = evicted.reduce((total, row) => total + row.bytes, 0);
  return { removed: [...removed, ...evicted], overQuotaBytes: Math.max(0, excess - freed) };
});
