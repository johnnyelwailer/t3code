/**
 * Stuck "Monitoring" pill — projection backstop.
 *
 * The in-memory liveness registry is the shell's `backgroundLiveness` source,
 * and a session that dies by FAILURE never emits `session.exited`, so a
 * registry entry can outlive the session. The shell mappers must therefore
 * never surface liveness for a terminal session (error / stopped /
 * interrupted) — the backstop tested here, independently of ingestion's
 * terminal-transition clear. Kept in a t3team-prefixed file per the additive
 * guard.
 */
import { ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import * as ThreadBackgroundLiveness from "../ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../ThreadPlanProgress.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";

const NOW = "2026-06-08T00:00:00.000Z";

const projectionSnapshotLayer = it.layer(
  OrchestrationProjectionSnapshotQueryLive.pipe(
    // Shared liveness instance: the test records registry entries directly,
    // then asserts the shell mappers apply the terminal-session backstop.
    // provideMerge keeps the service visible to the test body.
    Layer.provideMerge(ThreadBackgroundLiveness.layer),
    Layer.provide(ThreadPlanProgress.layer),
    Layer.provideMerge(RepositoryIdentityResolver.layer),
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provideMerge(NodeServices.layer),
  ),
);

projectionSnapshotLayer("ProjectionSnapshotQuery — background liveness backstop", (it) => {
  it.effect("never surfaces background liveness for a terminal session", () =>
    Effect.gen(function* () {
      const snapshotQuery = yield* ProjectionSnapshotQuery;
      const liveness = yield* ThreadBackgroundLiveness.ThreadBackgroundLivenessService;
      const sql = yield* SqlClient.SqlClient;

      // The registry STILL holds live entries — the point is that a terminal
      // projected session must not surface them.
      liveness.recordTaskLiveness({
        threadId: "thread-pill",
        taskId: "task-bash",
        taskType: "local_bash",
        status: undefined,
        kind: "started",
      });
      liveness.recordTaskLiveness({
        threadId: "thread-live",
        taskId: "task-agent",
        taskType: "subagent",
        status: "running",
        kind: "started",
      });

      yield* sql`DELETE FROM projection_projects`;
      yield* sql`DELETE FROM projection_threads`;
      yield* sql`DELETE FROM projection_thread_sessions`;
      yield* sql`
      INSERT INTO projection_projects (project_id, title, workspace_root, default_model_selection_json, scripts_json, created_at, updated_at, deleted_at)
      VALUES ('project-pill', 'Pill Project', '/tmp/pill', '{"provider":"codex","model":"gpt-5-codex"}', '[]', ${NOW}, ${NOW}, NULL)
    `;
      yield* sql`
      INSERT INTO projection_threads (thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode, branch, worktree_path, retention, latest_turn_id, latest_user_message_at, pending_approval_count, pending_user_input_count, has_actionable_proposed_plan, created_at, updated_at, archived_at, deleted_at)
      VALUES
        ('thread-pill', 'project-pill', 'Dead session', '{"provider":"codex","model":"gpt-5-codex"}', 'full-access', 'default', NULL, NULL, 'retained', NULL, NULL, 0, 0, 0, ${NOW}, ${NOW}, NULL, NULL),
        ('thread-live', 'project-pill', 'Live session', '{"provider":"codex","model":"gpt-5-codex"}', 'full-access', 'default', NULL, NULL, 'retained', NULL, NULL, 0, 0, 0, ${NOW}, ${NOW}, NULL, NULL)
    `;
      yield* sql`
      INSERT INTO projection_thread_sessions (thread_id, status, provider_name, active_turn_id, last_error, updated_at)
      VALUES
        ('thread-pill', 'error', 'codex', NULL, 'provider died', ${NOW}),
        ('thread-live', 'running', 'codex', 'turn-live', NULL, ${NOW})
    `;

      // Detail mapping: terminal session nulls the liveness; the live
      // session's "working" passes through unchanged.
      const dead = yield* snapshotQuery.getThreadShellById(ThreadId.make("thread-pill"));
      assert.equal(dead._tag, "Some");
      if (dead._tag === "Some") {
        assert.equal(dead.value.backgroundLiveness, null);
      }
      const live = yield* snapshotQuery.getThreadShellById(ThreadId.make("thread-live"));
      assert.equal(live._tag, "Some");
      if (live._tag === "Some") {
        assert.equal(live.value.backgroundLiveness, "working");
      }

      // List mapping (the sidebar's source): same backstop per thread.
      const shells = (yield* snapshotQuery.getShellSnapshot()).threads;
      const pill = shells.find((thread) => thread.id === ThreadId.make("thread-pill"));
      const running = shells.find((thread) => thread.id === ThreadId.make("thread-live"));
      assert.equal(pill?.backgroundLiveness, null);
      assert.equal(running?.backgroundLiveness, "working");
    }),
  );

  it.effect("still surfaces liveness for a dead-turn session that restarts", () =>
    Effect.gen(function* () {
      const snapshotQuery = yield* ProjectionSnapshotQuery;
      const liveness = yield* ThreadBackgroundLiveness.ThreadBackgroundLivenessService;
      const sql = yield* SqlClient.SqlClient;

      // A session that was terminal but came back to `ready` with a live
      // monitor (a resumed provider session re-opening a watch loop) must
      // surface liveness again: the backstop keys on the CURRENT status.
      liveness.recordTaskLiveness({
        threadId: "thread-resumed",
        taskId: "task-watch",
        taskType: "monitor",
        status: undefined,
        kind: "started",
      });
      yield* sql`DELETE FROM projection_projects`;
      yield* sql`DELETE FROM projection_threads`;
      yield* sql`DELETE FROM projection_thread_sessions`;
      yield* sql`
      INSERT INTO projection_projects (project_id, title, workspace_root, default_model_selection_json, scripts_json, created_at, updated_at, deleted_at)
      VALUES ('project-resume', 'Resume Project', '/tmp/resume', '{"provider":"codex","model":"gpt-5-codex"}', '[]', ${NOW}, ${NOW}, NULL)
    `;
      yield* sql`
      INSERT INTO projection_threads (thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode, branch, worktree_path, retention, latest_turn_id, latest_user_message_at, pending_approval_count, pending_user_input_count, has_actionable_proposed_plan, created_at, updated_at, archived_at, deleted_at)
      VALUES ('thread-resumed', 'project-resume', 'Resumed', '{"provider":"codex","model":"gpt-5-codex"}', 'full-access', 'default', NULL, NULL, 'retained', NULL, NULL, 0, 0, 0, ${NOW}, ${NOW}, NULL, NULL)
    `;
      yield* sql`
      INSERT INTO projection_thread_sessions (thread_id, status, provider_name, active_turn_id, last_error, updated_at)
      VALUES ('thread-resumed', 'ready', 'codex', NULL, NULL, ${NOW})
    `;

      const shell = yield* snapshotQuery.getThreadShellById(ThreadId.make("thread-resumed"));
      assert.equal(shell._tag, "Some");
      if (shell._tag === "Some") {
        assert.equal(shell.value.backgroundLiveness, "monitoring");
      }
    }),
  );
});
