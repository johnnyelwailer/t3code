import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" })));
const at = "2026-09-29T00:00:00.000Z";

layer("t3team-062_ProjectionThreadShellT3TeamFacts", (it) => {
  it.effect("backfills open child waits and the mirrored local session instance", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 81 });

      for (const threadId of ["waiting", "resolved", "mirrored", "plain"]) {
        yield* sql`
          INSERT INTO projection_threads (
            thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode,
            created_at, updated_at, pending_approval_count, pending_user_input_count,
            has_actionable_proposed_plan
          )
          VALUES (
            ${threadId}, 'project-1', ${threadId}, '{"instanceId":"codex","model":"gpt-5"}',
            'full-access', 'default', ${at}, ${at}, 0, 0, 0
          )
        `;
      }
      const activity = (id: string, threadId: string, kind: string, waitId: string) => sql`
        INSERT INTO projection_thread_activities (
          activity_id, thread_id, turn_id, tone, kind, summary, payload_json, created_at
        )
        VALUES (
          ${id}, ${threadId}, NULL, 'info', ${kind}, 'wait',
          ${JSON.stringify({ waitId, childThreadId: "child" })}, ${at}
        )
      `;
      yield* activity("a1", "waiting", "t3team.child_wait.registered", "w1");
      yield* activity("a2", "waiting", "t3team.child_wait.registered", "w2");
      yield* activity("a3", "waiting", "t3team.child_wait.resolved", "w1");
      yield* activity("a4", "resolved", "t3team.child_wait.registered", "w3");
      yield* activity("a5", "resolved", "t3team.child_wait.resolved", "w3");
      const message = (id: string, threadId: string) => sql`
        INSERT INTO projection_thread_messages (
          message_id, thread_id, turn_id, role, text, attachments_json, is_streaming,
          created_at, updated_at
        )
        VALUES (${id}, ${threadId}, NULL, 'user', 'hi', NULL, 0, ${at}, ${at})
      `;
      yield* message("local:claudeAgent:native:0", "mirrored");
      yield* message("msg-plain-1", "plain");

      yield* runMigrations();

      const rows = yield* sql<{
        readonly threadId: string;
        readonly openChildWaitCount: number;
        readonly localSessionInstanceId: string | null;
      }>`
        SELECT thread_id AS "threadId", open_child_wait_count AS "openChildWaitCount",
          local_session_instance_id AS "localSessionInstanceId"
        FROM projection_threads ORDER BY thread_id
      `;
      assert.deepStrictEqual(rows, [
        { threadId: "mirrored", openChildWaitCount: 0, localSessionInstanceId: "claudeAgent" },
        { threadId: "plain", openChildWaitCount: 0, localSessionInstanceId: null },
        { threadId: "resolved", openChildWaitCount: 0, localSessionInstanceId: null },
        { threadId: "waiting", openChildWaitCount: 1, localSessionInstanceId: null },
      ]);
    }),
  );
});
