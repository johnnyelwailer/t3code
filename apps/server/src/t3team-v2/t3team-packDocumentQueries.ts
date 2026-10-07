import type { T3TeamPackDocument } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

const Row = Schema.Struct({
  key: Schema.String,
  version: Schema.Number,
  doc: Schema.fromJsonString(Schema.Json),
  updatedAt: Schema.String,
  expiresAt: Schema.NullOr(Schema.String),
});
const columns = `doc_key AS "key", version, doc_json AS "doc", updated_at AS "updatedAt", expires_at AS "expiresAt"`;
const decodeRowArray = Schema.decodeUnknownEffect(Schema.Array(Row));
const decodeRows = (rows: ReadonlyArray<unknown>) =>
  decodeRowArray(rows).pipe(
    Effect.map((docs): T3TeamPackDocument[] =>
      docs.map(({ expiresAt, ...doc }) => ({
        ...doc,
        ...(expiresAt === null ? {} : { expiresAt }),
      })),
    ),
  );
const RemovedRow = Schema.Struct({
  collection: Schema.String,
  key: Schema.String,
  bytes: Schema.Number,
});
export const decodeRemovedRows = Schema.decodeUnknownEffect(Schema.Array(RemovedRow));
export const removedColumns = `collection, doc_key AS "key", byte_size AS "bytes"`;

export interface DocumentWrite {
  readonly json: string;
  readonly bytes: number;
  readonly now: string;
  readonly expiresAt: string | null;
}

/**
 * SQL methods always close over the owning pack; callers cannot override it. Reads take the
 * current time because an expired row is invisible from the moment it expires, not from the
 * retention pass that later deletes it.
 */
export function packDocumentQueries(sql: SqlClient.SqlClient, packId: string) {
  const live = (now: string) => sql`(expires_at IS NULL OR expires_at > ${now})`;
  const get = (collection: string, key: string, now: string) =>
    sql`SELECT ${sql.literal(columns)} FROM t3team_pack_documents
      WHERE pack_id = ${packId} AND collection = ${collection} AND doc_key = ${key}
      AND ${live(now)}`.pipe(
      Effect.flatMap(decodeRows),
      Effect.map((rows) => rows[0] ?? null),
    );
  const list = (
    collection: string,
    now: string,
    options: { prefix?: string; after?: string; limit?: number },
  ) =>
    sql`SELECT ${sql.literal(columns)} FROM t3team_pack_documents
      WHERE pack_id = ${packId} AND collection = ${collection} AND ${live(now)}
      AND substr(doc_key, 1, ${options.prefix?.length ?? 0}) = ${options.prefix ?? ""}
      AND (${options.after ?? null} IS NULL OR doc_key > ${options.after ?? null})
      ORDER BY doc_key COLLATE BINARY LIMIT ${options.limit ?? -1}`.pipe(
      Effect.flatMap(decodeRows),
    );
  const insert = (collection: string, key: string, value: DocumentWrite) =>
    sql`INSERT INTO t3team_pack_documents
      (pack_id, collection, doc_key, version, doc_json, byte_size, created_at, updated_at, last_read_at, expires_at)
      VALUES (${packId}, ${collection}, ${key}, 1, ${value.json}, ${value.bytes},
        ${value.now}, ${value.now}, ${value.now}, ${value.expiresAt})
      ON CONFLICT(pack_id, collection, doc_key) DO NOTHING RETURNING ${sql.literal(columns)}`.pipe(
      Effect.flatMap(decodeRows),
      Effect.map((rows) => rows[0] ?? null),
    );
  const update = (collection: string, key: string, value: DocumentWrite, ifVersion?: number) =>
    sql`UPDATE t3team_pack_documents SET version = version + 1, doc_json = ${value.json},
      byte_size = ${value.bytes}, updated_at = ${value.now}, expires_at = ${value.expiresAt}
      WHERE pack_id = ${packId} AND collection = ${collection} AND doc_key = ${key}
      AND (${ifVersion ?? null} IS NULL OR version = ${ifVersion ?? null})
      RETURNING ${sql.literal(columns)}`.pipe(
      Effect.flatMap(decodeRows),
      Effect.map((rows) => rows[0] ?? null),
    );
  /** Writes first drop an expired row, so an expired document behaves exactly like a missing one. */
  const purgeExpired = (collection: string, key: string, now: string) =>
    sql`DELETE FROM t3team_pack_documents
      WHERE pack_id = ${packId} AND collection = ${collection} AND doc_key = ${key}
      AND expires_at IS NOT NULL AND expires_at <= ${now}
      RETURNING ${sql.literal(removedColumns)}`.pipe(Effect.flatMap(decodeRemovedRows));
  const remove = (collection: string, target: { key: string } | { prefix: string }) => {
    const prefix = "prefix" in target ? target.prefix : null;
    const key = "key" in target ? target.key : null;
    return sql`DELETE FROM t3team_pack_documents
      WHERE pack_id = ${packId} AND collection = ${collection}
      AND (${key} IS NULL OR doc_key = ${key})
      AND (${prefix} IS NULL OR substr(doc_key, 1, ${prefix?.length ?? 0}) = ${prefix ?? ""})
      RETURNING ${sql.literal(removedColumns)}`.pipe(Effect.flatMap(decodeRemovedRows));
  };
  const touch = (collection: string, key: string, now: string) =>
    sql`UPDATE t3team_pack_documents SET last_read_at = ${now}
      WHERE pack_id = ${packId} AND collection = ${collection} AND doc_key = ${key}
      AND ${live(now)}`.pipe(Effect.asVoid);
  return { get, list, insert, update, purgeExpired, remove, touch };
}
