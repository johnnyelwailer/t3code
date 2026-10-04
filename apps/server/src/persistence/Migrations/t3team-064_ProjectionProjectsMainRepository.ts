/**
 * Project main repository (flag `NEXI_FF_MAIN_REPOSITORY`): the repository whose checkout is the
 * project's shared workspace, as a JSON-encoded `ProjectMainRepository` (NULL = none recorded).
 * PRAGMA-guarded so a re-run on a machine whose ledger already holds the column is a no-op.
 */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_projects)
  `;

  if (!columns.some((column) => column.name === "main_repository_json")) {
    yield* sql`
      ALTER TABLE projection_projects
      ADD COLUMN main_repository_json TEXT
    `;
  }
});
