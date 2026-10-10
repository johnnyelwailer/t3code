import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** Environment-local pack documents; migration ledger id 105. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE t3team_pack_documents (
    pack_id TEXT NOT NULL, collection TEXT NOT NULL, doc_key TEXT NOT NULL,
    scope_kind TEXT NOT NULL DEFAULT 'environment',
    version INTEGER NOT NULL, doc_json TEXT NOT NULL, byte_size INTEGER NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_read_at TEXT NOT NULL, expires_at TEXT,
    PRIMARY KEY (pack_id, collection, doc_key)
  )`;
  yield* sql`CREATE INDEX t3team_pack_documents_retention
    ON t3team_pack_documents(pack_id, collection, last_read_at)`;
});
