/**
 * Execution-environment binding on the thread read model: the `environment_json`
 * column (migration 71, t3team start_child `environment`) flows through the
 * shell + detail thread DTOs — a cross-environment child is VISIBLE to its
 * parent with the target environment stamped, while legacy rows (NULL column)
 * keep no environment key at all (byte-identical default behavior).
 *
 * Kept in a t3team-prefixed file per the additive guard.
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

projectionSnapshotLayer("ProjectionSnapshotQuery — thread environment binding", (it) => {
  const seed = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`DELETE FROM projection_projects`;
    yield* sql`DELETE FROM projection_threads`;
    yield* sql`
      INSERT INTO projection_projects (project_id, title, workspace_root, default_model_selection_json, scripts_json, created_at, updated_at, deleted_at)
      VALUES ('project-env', 'Env Project', '/tmp/env', '{"provider":"codex","model":"gpt-5-codex"}', '[]', '2026-09-14T00:00:00.000Z', '2026-09-14T00:00:00.000Z', NULL)
    `;
    yield* sql`
      INSERT INTO projection_threads (thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode, branch, worktree_path, retention, latest_turn_id, latest_user_message_at, pending_approval_count, pending_user_input_count, has_actionable_proposed_plan, created_at, updated_at, archived_at, deleted_at, environment_json)
      VALUES
        ('thread-legacy', 'project-env', 'Legacy child', '{"provider":"codex","model":"gpt-5-codex"}', 'full-access', 'default', NULL, NULL, 'retained', NULL, NULL, 0, 0, 0, '2026-09-14T00:00:01.000Z', '2026-09-14T00:00:01.000Z', NULL, NULL, NULL),
        ('thread-cross', 'project-env', 'Cross-env child', '{"provider":"codex","model":"gpt-5-codex"}', 'full-access', 'default', NULL, NULL, 'retained', NULL, NULL, 0, 0, 0, '2026-09-14T00:00:02.000Z', '2026-09-14T00:00:02.000Z', NULL, NULL, '{"environmentId":"env-remote","label":"GHA runner"}'),
        ('thread-cross-2', 'project-env', 'Cross-env child 2', '{"provider":"codex","model":"gpt-5-codex"}', 'full-access', 'default', NULL, NULL, 'retained', NULL, NULL, 0, 0, 0, '2026-09-14T00:00:03.000Z', '2026-09-14T00:00:03.000Z', NULL, NULL, '{"environmentId":"env-remote","label":"GHA runner v2"}'),
        ('thread-gha', 'project-env', 'GHA child', '{"provider":"codex","model":"gpt-5-codex"}', 'full-access', 'default', NULL, NULL, 'retained', NULL, NULL, 0, 0, 0, '2026-09-14T00:00:04.000Z', '2026-09-14T00:00:04.000Z', NULL, NULL, '{"environmentId":"env-gha","label":"Actions"}')
    `;
  });

  it.effect("surfaces the environment binding on shell + detail DTOs, legacy rows stay clean", () =>
    Effect.gen(function* () {
      yield* seed;
      const snapshotQuery = yield* ProjectionSnapshotQuery;

      const shell = yield* snapshotQuery.getShellSnapshot();
      const byId = new Map(shell.threads.map((thread) => [String(thread.id), thread]));
      const legacy = byId.get("thread-legacy");
      const cross = byId.get("thread-cross");
      assert.ok(legacy, "legacy thread is in the shell snapshot");
      assert.ok(cross, "cross-environment thread is in the shell snapshot");
      assert.strictEqual((legacy as { environment?: unknown }).environment, undefined);
      const crossEnvironment = (
        cross as { environment?: { environmentId?: unknown; label?: unknown } }
      ).environment;
      assert.strictEqual(crossEnvironment?.environmentId, "env-remote");
      assert.strictEqual(crossEnvironment?.label, "GHA runner");

      // The single-thread shell read (the children tool's status path) too.
      const crossShell = yield* snapshotQuery.getThreadShellById(ThreadId.make("thread-cross"));
      assert.strictEqual(crossShell._tag, "Some");
      if (crossShell._tag === "Some") {
        assert.strictEqual(crossShell.value.environment?.environmentId, "env-remote");
        assert.strictEqual(crossShell.value.environment?.label, "GHA runner");
      }
      const legacyShell = yield* snapshotQuery.getThreadShellById(ThreadId.make("thread-legacy"));
      assert.strictEqual(legacyShell._tag, "Some");
      if (legacyShell._tag === "Some") {
        assert.strictEqual((legacyShell.value as { environment?: unknown }).environment, undefined);
      }

      // …and the detail load (the children tool's status op).
      const crossDetail = yield* snapshotQuery.getThreadDetailById(ThreadId.make("thread-cross"));
      assert.strictEqual(crossDetail._tag, "Some");
      if (crossDetail._tag === "Some") {
        assert.strictEqual(crossDetail.value.environment?.environmentId, "env-remote");
        assert.strictEqual(crossDetail.value.environment?.label, "GHA runner");
      }

      // Distinct cross-environment bindings (the children `environments` op
      // data source): grouped per recorded JSON, newest first, own-env rows
      // (NULL column) excluded.
      const readBindings = snapshotQuery.listEnvironmentBindings;
      assert.ok(readBindings, "live query provides listEnvironmentBindings");
      const bindings = yield* readBindings();
      assert.strictEqual(bindings.length, 3);
      assert.strictEqual(String(bindings[0]?.environmentId), "env-gha");
      assert.strictEqual(bindings[0]?.label, "Actions");
      assert.strictEqual(bindings[0]?.threadCount, 1);
      assert.strictEqual(bindings[0]?.latestThreadAt, "2026-09-14T00:00:04.000Z");
      assert.strictEqual(String(bindings[1]?.environmentId), "env-remote");
      assert.strictEqual(bindings[1]?.label, "GHA runner v2");
      assert.strictEqual(bindings[1]?.threadCount, 1);
      assert.strictEqual(bindings[1]?.latestThreadAt, "2026-09-14T00:00:03.000Z");
      assert.strictEqual(String(bindings[2]?.environmentId), "env-remote");
      assert.strictEqual(bindings[2]?.label, "GHA runner");
      assert.strictEqual(bindings[2]?.threadCount, 1);
      assert.strictEqual(bindings[2]?.latestThreadAt, "2026-09-14T00:00:02.000Z");
    }),
  );
});
