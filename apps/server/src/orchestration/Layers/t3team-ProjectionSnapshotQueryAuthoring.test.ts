/**
 * An `authoring` workflow row must decode through the real shell snapshot query.
 * The status literal was missing from the row schema, so one authoring run failed
 * `getShellSnapshot` for every thread.
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

const projectionSnapshotLayer = it.layer(
  OrchestrationProjectionSnapshotQueryLive.pipe(
    Layer.provide(ThreadBackgroundLiveness.layer),
    Layer.provide(ThreadPlanProgress.layer),
    Layer.provideMerge(RepositoryIdentityResolver.layer),
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provideMerge(NodeServices.layer),
  ),
);

projectionSnapshotLayer("ProjectionSnapshotQuery — authoring runs", (it) => {
  it.effect("decodes an authoring row on the shell snapshot and the per-thread read", () =>
    Effect.gen(function* () {
      const snapshotQuery = yield* ProjectionSnapshotQuery;
      const sql = yield* SqlClient.SqlClient;
      yield* sql`DELETE FROM projection_projects`;
      yield* sql`DELETE FROM projection_threads`;
      yield* sql`DELETE FROM workflow_runs`;
      yield* sql`
        INSERT INTO projection_projects (
          project_id, title, workspace_root, default_model_selection_json, scripts_json,
          created_at, updated_at, deleted_at
        ) VALUES (
          'project-authoring', 'Authoring', '/tmp/authoring',
          '{"provider":"codex","model":"gpt-5-codex"}', '[]',
          '2026-06-08T00:00:00.000Z', '2026-06-08T00:00:01.000Z', NULL
        )
      `;
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode,
          branch, worktree_path, latest_turn_id, latest_user_message_at, pending_approval_count,
          pending_user_input_count, has_actionable_proposed_plan, created_at, updated_at,
          archived_at, deleted_at
        ) VALUES (
          'thread-authoring', 'project-authoring', 'Authoring launch',
          '{"provider":"codex","model":"gpt-5-codex"}', 'full-access', 'default',
          NULL, NULL, NULL, NULL, 0, 0, 0,
          '2026-06-08T00:00:02.000Z', '2026-06-08T00:00:03.000Z', NULL, NULL
        )
      `;
      yield* sql`
        INSERT INTO workflow_runs (
          run_id, workflow_path, args_json, args_hash, launch_thread_id, project_id,
          model_json, runtime_mode, interaction_mode, status, pending_thread_id,
          pending_correlation_id, pending_kind, wake_at, created_at, updated_at
        ) VALUES (
          'run-authoring', '/tmp/authoring/workflow.ts', '{}', 'args-hash',
          'thread-authoring', 'project-authoring', '{}', 'full-access', 'default',
          'authoring', NULL, NULL, NULL, NULL,
          '2026-06-08T00:00:04.000Z', '2026-06-08T00:00:05.000Z'
        )
      `;

      const shell = yield* snapshotQuery.getShellSnapshot();
      const thread = shell.threads.find((entry) => entry.id === ThreadId.make("thread-authoring"));
      assert.strictEqual(thread?.workflowRunStatus?.status, "authoring");
      assert.strictEqual(thread?.workflowRunStatus?.runId, "run-authoring");

      const byId = yield* snapshotQuery.getThreadShellById(ThreadId.make("thread-authoring"));
      assert.strictEqual(byId._tag, "Some");
      if (byId._tag === "Some") {
        assert.strictEqual(byId.value.workflowRunStatus?.status, "authoring");
      }
    }),
  );
});
