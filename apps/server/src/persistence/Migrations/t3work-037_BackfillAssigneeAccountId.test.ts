import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../Layers/Sqlite.ts";
import Migration0037 from "./t3work-037_BackfillAssigneeAccountId.ts";

const layer = it.layer(SqlitePersistenceMemory);

layer("t3work-037 BackfillAssigneeAccountId", (it) => {
  // Runs first: the shared in-memory DB has no backlog table yet, so this
  // genuinely exercises the table-existence guard.
  it.effect("is a no-op when the backlog table does not exist yet", () =>
    Effect.gen(function* () {
      yield* Migration0037;
      assert.ok(true, "migration completed without the table present");
    }),
  );

  it.effect(
    "fills assignee_account_id from resource_json for pre-migration rows and leaves the rest alone",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`
          CREATE TABLE IF NOT EXISTS t3work_atlassian_backlog_issues (
            provider TEXT NOT NULL,
            account_id TEXT NOT NULL,
            external_project_id TEXT NOT NULL,
            issue_id TEXT NOT NULL,
            issue_key TEXT,
            resource_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            assignee_account_id TEXT,
            PRIMARY KEY (provider, account_id, external_project_id, issue_id)
          )
        `;

        const insert = (issueId: string, json: string, assignee: string | null) => sql`
          INSERT INTO t3work_atlassian_backlog_issues (
            provider, account_id, external_project_id, issue_id, issue_key,
            resource_json, updated_at, assignee_account_id
          )
          VALUES ('atlassian', 'acct', 'proj', ${issueId}, ${issueId}, ${json}, 1, ${assignee})
        `;

        // Pre-migration row: column NULL, assignee present in the JSON.
        yield* insert("IES-1", JSON.stringify({ id: "IES-1", assigneeAccountId: "user-a" }), null);
        // Pre-migration row without an assignee in the JSON: must stay NULL.
        yield* insert("IES-2", JSON.stringify({ id: "IES-2" }), null);
        // Row already written post-migration: must not be overwritten.
        yield* insert(
          "IES-3",
          JSON.stringify({ id: "IES-3", assigneeAccountId: "user-json" }),
          "user-column",
        );

        yield* Migration0037;

        const rows = yield* sql<{ issueId: string; assignee: string | null }>`
          SELECT issue_id AS "issueId", assignee_account_id AS "assignee"
          FROM t3work_atlassian_backlog_issues
          ORDER BY issue_id
        `;

        assert.deepStrictEqual(
          rows.map((row) => ({ issueId: row.issueId, assignee: row.assignee })),
          [
            { issueId: "IES-1", assignee: "user-a" },
            { issueId: "IES-2", assignee: null },
            { issueId: "IES-3", assignee: "user-column" },
          ],
        );
      }),
  );

});
