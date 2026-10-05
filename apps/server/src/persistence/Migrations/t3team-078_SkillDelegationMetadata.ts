import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * Skills requested for a delegated child (ledger id 102): `delegate_task` may name
 * 1-5 skills under `extensions.skills`. The host persists the REQUESTED names only
 * (format-validated; it does not know the skill catalog) — the child's driver
 * resolves them from its pack registry at session start. NULL = no skill
 * delegation (the state of every pre-existing row). Written by
 * `t3team-childThreadMetadata.ts` when delegate_task creates a child.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE t3team_child_thread_metadata ADD COLUMN skills TEXT NULL`;
});
