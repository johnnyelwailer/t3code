/**
 * Epic 27 — the read path for the "sleeping" routine signal.
 *
 * The engine parks a run with status `sleeping` + `wake_at` (t3work-035) tied to its
 * `launch_thread_id`. This asserts that the shell + detail thread DTOs the client reads surface
 * the SOONEST sleeping `wake_at` as `sleepingUntil`, joined by launch thread — lighting the
 * sidebar's dormant-routine pill — and omit it for threads with no clock-parked run.
 *
 * Kept in a t3work-prefixed file (not the upstream ProjectionSnapshotQuery.test.ts) per the
 * additive guard.
 */
import { ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { ORCHESTRATION_PROJECTOR_NAMES } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";

const projectionSnapshotLayer = it.layer(
  OrchestrationProjectionSnapshotQueryLive.pipe(
    Layer.provideMerge(RepositoryIdentityResolver.layer),
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provideMerge(NodeServices.layer),
  ),
);

projectionSnapshotLayer("ProjectionSnapshotQuery — sleeping routines (Epic 27)", (it) => {
  it.effect(
    "surfaces the soonest sleeping workflow_run wake_at as sleepingUntil on the thread DTOs",
    () =>
      Effect.gen(function* () {
        const snapshotQuery = yield* ProjectionSnapshotQuery;
        const sql = yield* SqlClient.SqlClient;

        yield* sql`DELETE FROM projection_projects`;
        yield* sql`DELETE FROM projection_threads`;
        yield* sql`DELETE FROM projection_state`;
        yield* sql`DELETE FROM workflow_runs`;

        yield* sql`
          INSERT INTO projection_projects (
            project_id,
            title,
            workspace_root,
            default_model_selection_json,
            scripts_json,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES (
            'project-routines',
            'Routines Project',
            '/tmp/routines',
            '{"provider":"codex","model":"gpt-5-codex"}',
            '[]',
            '2026-06-08T00:00:00.000Z',
            '2026-06-08T00:00:01.000Z',
            NULL
          )
        `;

        yield* sql`
          INSERT INTO projection_threads (
            thread_id,
            project_id,
            title,
            model_selection_json,
            runtime_mode,
            interaction_mode,
            branch,
            worktree_path,
            latest_turn_id,
            latest_user_message_at,
            pending_approval_count,
            pending_user_input_count,
            has_actionable_proposed_plan,
            created_at,
            updated_at,
            archived_at,
            deleted_at
          )
          VALUES
            (
              'thread-sleeping',
              'project-routines',
              'Weekly triage',
              '{"provider":"codex","model":"gpt-5-codex"}',
              'full-access',
              'default',
              NULL,
              NULL,
              NULL,
              NULL,
              0,
              0,
              0,
              '2026-06-08T00:00:02.000Z',
              '2026-06-08T00:00:03.000Z',
              NULL,
              NULL
            ),
            (
              'thread-awake',
              'project-routines',
              'Active work',
              '{"provider":"codex","model":"gpt-5-codex"}',
              'full-access',
              'default',
              NULL,
              NULL,
              NULL,
              NULL,
              0,
              0,
              0,
              '2026-06-08T00:00:04.000Z',
              '2026-06-08T00:00:05.000Z',
              NULL,
              NULL
            )
        `;

        // Mirror the scheduler's data shape: a run is "sleeping" with a future wake_at, tied to
        // its launch thread. Two sleeping runs on one thread → the SOONEST wake_at wins. The
        // running run (no wake_at) and the headless sleeping run (no launch thread) must not leak.
        const insertRun = (
          runId: string,
          launchThreadId: string | null,
          status: string,
          wakeAt: string | null,
        ) =>
          sql`
            INSERT INTO workflow_runs (
              run_id,
              workflow_path,
              args_json,
              args_hash,
              launch_thread_id,
              project_id,
              model_json,
              runtime_mode,
              interaction_mode,
              status,
              pending_thread_id,
              pending_correlation_id,
              pending_kind,
              wake_at,
              created_at,
              updated_at
            )
            VALUES (
              ${runId},
              '/tmp/routines/weekly.workflow.ts',
              '{}',
              'args-hash',
              ${launchThreadId},
              'project-routines',
              '{}',
              'full-access',
              'default',
              ${status},
              NULL,
              ${status === "sleeping" ? "corr-" + runId : null},
              NULL,
              ${wakeAt},
              '2026-06-08T00:00:06.000Z',
              '2026-06-08T00:00:06.000Z'
            )
          `;

        yield* insertRun(
          "run-sleep-late",
          "thread-sleeping",
          "sleeping",
          "2026-07-01T12:00:00.000Z",
        );
        yield* insertRun(
          "run-sleep-soon",
          "thread-sleeping",
          "sleeping",
          "2026-06-20T08:00:00.000Z",
        );
        yield* insertRun("run-awake", "thread-awake", "running", null);
        yield* insertRun("run-headless", null, "sleeping", "2026-06-19T08:00:00.000Z");

        yield* sql`
          INSERT INTO projection_state (projector, last_applied_sequence, updated_at)
          VALUES
            (${ORCHESTRATION_PROJECTOR_NAMES.projects}, 6, '2026-06-08T00:00:07.000Z'),
            (${ORCHESTRATION_PROJECTOR_NAMES.threads}, 6, '2026-06-08T00:00:07.000Z'),
            (${ORCHESTRATION_PROJECTOR_NAMES.threadMessages}, 6, '2026-06-08T00:00:07.000Z'),
            (${ORCHESTRATION_PROJECTOR_NAMES.threadProposedPlans}, 6, '2026-06-08T00:00:07.000Z'),
            (${ORCHESTRATION_PROJECTOR_NAMES.threadActivities}, 6, '2026-06-08T00:00:07.000Z'),
            (${ORCHESTRATION_PROJECTOR_NAMES.threadSessions}, 6, '2026-06-08T00:00:07.000Z'),
            (${ORCHESTRATION_PROJECTOR_NAMES.checkpoints}, 6, '2026-06-08T00:00:07.000Z')
        `;

        const SOONEST = "2026-06-20T08:00:00.000Z";

        const shellSnapshot = yield* snapshotQuery.getShellSnapshot();
        const sleepingShell = shellSnapshot.threads.find(
          (thread) => thread.id === ThreadId.make("thread-sleeping"),
        );
        const awakeShell = shellSnapshot.threads.find(
          (thread) => thread.id === ThreadId.make("thread-awake"),
        );
        assert.equal(sleepingShell?.sleepingUntil, SOONEST);
        assert.equal(awakeShell?.sleepingUntil, undefined);

        const sleepingById = yield* snapshotQuery.getThreadShellById(
          ThreadId.make("thread-sleeping"),
        );
        assert.equal(sleepingById._tag, "Some");
        if (sleepingById._tag === "Some") {
          assert.equal(sleepingById.value.sleepingUntil, SOONEST);
        }

        const awakeById = yield* snapshotQuery.getThreadShellById(ThreadId.make("thread-awake"));
        assert.equal(awakeById._tag, "Some");
        if (awakeById._tag === "Some") {
          assert.equal(awakeById.value.sleepingUntil, undefined);
        }

        const detail = yield* snapshotQuery.getThreadDetailById(ThreadId.make("thread-sleeping"));
        assert.equal(detail._tag, "Some");
        if (detail._tag === "Some") {
          assert.equal(detail.value.sleepingUntil, SOONEST);
        }
      }),
  );
});
