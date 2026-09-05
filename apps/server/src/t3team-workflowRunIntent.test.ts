// @effect-diagnostics preferSchemaOverJson:off -- argv/fixture JSON at a process boundary, not a domain payload.
/**
 * A run's launch `intent` survives the launch (migration 051).
 *
 * `intent` ({goal, expectedOutcome, guardrails}) is REQUIRED by `t3team.orchestration.run` and,
 * before this migration, discarded the moment self-heal stopped needing it. Without a stored
 * `expectedOutcome` a report can say WHAT happened but never whether the run achieved what it was
 * asked to — the judgement that decides whether a human has to get involved (Epic 25 §Auto-report
 * on completion).
 *
 * Three things are pinned here, and the third is the one that breaks in production:
 *   1. an intent written at launch reads back structurally identical;
 *   2. a launch that carries no intent reads back `null`, not a fabricated empty one;
 *   3. a row written by a PRE-051 writer (no `intent_json` in the INSERT) reads back `null`
 *      rather than failing the decode — which would abort the boot scan for every run at once.
 */
import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowRunRepository, type WorkflowRun } from "./persistence/Services/WorkflowRuns.ts";
import { buildRunningWorkflowRunRow } from "./t3team-workflowEngineDurability.ts";
import { buildPreparedWorkflowLifecycle } from "./t3team-workflowEphemeralLifecycle.ts";

const projectId = ProjectId.make("project-intent");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const nowIso = (): string => "2026-08-29T00:00:00.000Z";

const intent = {
  goal: "Ship the parity fix behind the QA gate",
  expectedOutcome: "output parity verified and the benchmark within 5% of baseline",
  guardrails: ["never push to main", "no schema changes"],
} as const;

function baseRow(runId: string): WorkflowRun {
  return buildRunningWorkflowRunRow({
    runId,
    workflowPath: "/w/flow.workflow.ts",
    args: {},
    launchThreadId: "thread-1",
    projectId,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    origin: "ephemeral",
    nowIso: nowIso(),
  });
}

const layer = it.layer(WorkflowRunRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)));

layer("workflow run intent persistence (migration 051)", (it) => {
  it.effect("an intent written at launch reads back unchanged", () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      yield* repo.upsert({ ...baseRow("run-intent-1"), intent });

      const stored = yield* repo.getById({ runId: "run-intent-1" });
      assert.ok(Option.isSome(stored));
      assert.deepStrictEqual(stored.value.intent, intent);
    }),
  );

  it.effect("a launch without an intent reads back null, never a fabricated one", () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      yield* repo.upsert(baseRow("run-intent-2"));

      const stored = yield* repo.getById({ runId: "run-intent-2" });
      assert.ok(Option.isSome(stored));
      assert.strictEqual(stored.value.intent ?? null, null);
    }),
  );

  it.effect("a pre-051 row (no intent_json written) reads back as absent, not a crash", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const repo = yield* WorkflowRunRepository;
      yield* sql`
        INSERT INTO workflow_runs (
          run_id, workflow_path, args_json, args_hash, launch_thread_id, project_id,
          model_json, runtime_mode, interaction_mode, status, origin,
          pending_thread_id, pending_correlation_id, pending_kind, wake_at,
          created_at, updated_at
        )
        VALUES (
          'run-legacy-intent', '/w/flow.workflow.ts', '{}', 'hash', NULL, ${projectId},
          ${JSON.stringify(modelSelection)}, 'full-access', 'default', 'completed', 'ephemeral',
          NULL, NULL, NULL, NULL,
          ${nowIso()}, ${nowIso()}
        )
      `;

      const stored = yield* repo.getById({ runId: "run-legacy-intent" });
      assert.ok(Option.isSome(stored));
      assert.strictEqual(stored.value.intent ?? null, null);

      // And it is still readable by the boot scan, which is the reason the decode is lenient.
      const listed = yield* repo.listByStatus({ status: "completed" });
      assert.ok(listed.some((row) => row.runId === "run-legacy-intent"));
    }),
  );

  it.effect("an unreadable intent_json degrades that ONE row instead of failing the scan", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const repo = yield* WorkflowRunRepository;
      yield* repo.upsert({ ...baseRow("run-intent-bad"), status: "suspended", intent });
      yield* sql`UPDATE workflow_runs SET intent_json = 'not-json' WHERE run_id = 'run-intent-bad'`;
      yield* repo.upsert({ ...baseRow("run-intent-good"), status: "suspended", intent });

      const listed = yield* repo.listByStatus({ status: "suspended" });
      assert.strictEqual(listed.length, 2);
      const bad = listed.find((row) => row.runId === "run-intent-bad");
      const good = listed.find((row) => row.runId === "run-intent-good");
      assert.strictEqual(bad?.intent ?? null, null);
      assert.deepStrictEqual(good?.intent, intent);
    }),
  );

  it.effect("the launch funnel puts the tool's intent on the row it records", () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const lifecycle = buildPreparedWorkflowLifecycle({
        deps: {
          registry: {} as never,
          runRepository: repo,
          journalStore: {} as never,
          rearmScheduler: async () => {},
          dispatch: async () => {},
        },
        run: {
          runId: "run-intent-funnel",
          workflowPath: "/w/flow.workflow.ts",
          args: {},
          intent,
          workspaceRoot: "/w",
          launchThreadId: "thread-1",
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          origin: "ephemeral",
        },
        nowIso,
      });
      yield* Effect.promise(() => lifecycle.recordRunning());

      const stored = yield* repo.getById({ runId: "run-intent-funnel" });
      assert.ok(Option.isSome(stored));
      assert.deepStrictEqual(stored.value.intent, intent);
    }),
  );
});
