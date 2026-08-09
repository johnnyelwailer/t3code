/**
 * Project work-source bindings (Atlassian/Jira/etc. durability).
 *
 * Today a project's binding to an external work source (`accountId`,
 * `externalProjectId`) lives only in browser localStorage, so a fresh state
 * dir silently produces a permanently broken project. This table is the
 * server-side projection of `project.created` / `project.meta-updated`
 * events that carry a `source` (see `t3team-projectSourceBindingProjection.ts`).
 *
 * `provider`/`account_id`/`external_project_id` are nullable at the column
 * level even though a non-`local` binding always has them, because a
 * `{ provider: "local" }` row has no ids at all — the CHECK lives in the
 * contracts-level `ProjectSourceBinding` schema, not in SQL.
 *
 * The `projection_state` seed below registers this projector's cursor at
 * the CURRENT max event sequence rather than 0: no historical event can
 * carry a `source` (the field didn't exist yet), so replaying the full
 * event store for this projector on next boot would be pure cost with zero
 * rows produced.
 */
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS t3team_project_source_bindings (
      project_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      account_id TEXT,
      external_project_id TEXT,
      external_project_key TEXT,
      external_project_url TEXT,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_t3team_project_source_bindings_external
    ON t3team_project_source_bindings(provider, account_id, external_project_id)
  `;

  yield* sql`
    INSERT OR IGNORE INTO projection_state (projector, last_applied_sequence, updated_at)
    VALUES (
      't3team.projection.project-source-bindings',
      (SELECT COALESCE(MAX(sequence), 0) FROM orchestration_events),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
  `;
});
