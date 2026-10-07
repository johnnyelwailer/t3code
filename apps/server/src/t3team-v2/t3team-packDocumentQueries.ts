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
export interface DocumentWrite {
  readonly json: string;
  readonly bytes: number;
  readonly now: string;
  readonly expiresAt: string | null;
}

/** SQL methods always close over the owning pack; callers cannot override it. */
export function packDocumentQueries(sql: SqlClient.SqlClient, packId: string) {
  const get = (collection: string, key: string) =>
    sql`SELECT ${sql.literal(columns)} FROM t3team_pack_documents
      WHERE pack_id = ${packId} AND collection = ${collection} AND doc_key = ${key}`.pipe(
      Effect.flatMap(decodeRows),
      Effect.map((rows) => rows[0] ?? null),
    );
  const list = (
    collection: string,
    options: { prefix?: string; key?: string; after?: string; limit?: number },
  ) =>
    sql`SELECT ${sql.literal(columns)} FROM t3team_pack_documents
      WHERE pack_id = ${packId} AND collection = ${collection}
      AND substr(doc_key, 1, ${options.prefix?.length ?? 0}) = ${options.prefix ?? ""}
      AND (${options.key ?? null} IS NULL OR doc_key = ${options.key ?? null})
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
  return { get, list, insert, update };
}
