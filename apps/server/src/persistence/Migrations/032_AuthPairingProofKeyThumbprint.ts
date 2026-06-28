import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const postgres = yield* sql<{ readonly version: string }>`SELECT version() AS version`.pipe(
    Effect.map(() => true),
    Effect.orElseSucceed(() => false),
  );

  const pairingLinkColumns = postgres
    ? yield* sql<{ readonly name: string }>`
        SELECT column_name AS name
        FROM information_schema.columns
        WHERE table_name = 'auth_pairing_links'
      `
    : yield* sql<{ readonly name: string }>`
        PRAGMA table_info(auth_pairing_links)
      `;
  if (!pairingLinkColumns.some((column) => column.name === "proof_key_thumbprint")) {
    yield* sql`
      ALTER TABLE auth_pairing_links
      ADD COLUMN proof_key_thumbprint TEXT
    `;
  }
});
