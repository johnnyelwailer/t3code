/**
 * An `authoring` workflow row must decode into the launch thread's facts (the sidebar status
 * pill). V1 hit this as a shell-snapshot decode failure; under V2 a status the contract does not
 * know reads as "no run", so the pill would silently vanish while the author works.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { readWorkflowRunFacts } from "./t3team-workflowHostRunFacts.ts";

const layer = it.layer(Layer.mergeAll(SqlitePersistenceMemory, NodeServices.layer));

layer("readWorkflowRunFacts — authoring runs", (it) => {
  it.effect("reports an authoring run as the launch thread's latest status", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
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
      const facts = yield* readWorkflowRunFacts(sql, "thread-authoring");
      assert.strictEqual(facts.workflowRunStatus?.status, "authoring");
      assert.strictEqual(facts.workflowRunStatus?.runId, "run-authoring");
      assert.strictEqual(facts.workflowRunStatus?.title, "workflow");
      assert.strictEqual(facts.workflowRunStatus?.messageId, "t3team-wf-shape:run-authoring");
      assert.isNull(facts.sleepingUntil);
    }),
  );

  it.effect("prefers an agent-authored intent goal over workflow identity", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        INSERT INTO workflow_runs (
          run_id, workflow_path, args_json, args_hash, launch_thread_id, project_id,
          model_json, runtime_mode, interaction_mode, status, origin, intent_json,
          pending_thread_id, pending_correlation_id, pending_kind, wake_at, created_at, updated_at
        ) VALUES (
          'run-goal', '/tmp/authored/generated.workflow.ts', '{}', 'args-hash',
          'thread-goal', 'project-goal', '{}', 'full-access', 'default',
          'sleeping', 'ephemeral', '{"goal":"Publish the October release"}',
          NULL, NULL, NULL, '2026-10-13T08:00:00.000Z',
          '2026-10-12T00:00:04.000Z', '2026-10-12T00:00:05.000Z'
        )
      `;
      const facts = yield* readWorkflowRunFacts(sql, "thread-goal");
      assert.strictEqual(facts.workflowRunStatus?.title, "Publish the October release");
    }),
  );

  // A recipe module's body is conventionally `workflow.ts`, so its basename names nothing: the
  // session's machine-setup kickoff showed up as "workflow" on the thread's orchestration card.
  it.effect("names a recipe run by its recipe when the body file is the generic workflow.ts", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        INSERT INTO workflow_runs (
          run_id, workflow_path, args_json, args_hash, launch_thread_id, project_id,
          model_json, runtime_mode, interaction_mode, status, origin, recipe_path,
          pending_thread_id, pending_correlation_id, pending_kind, wake_at, created_at, updated_at
        ) VALUES (
          'run-recipe', '/repo/.nexi/recipes/machine-setup/workflow.ts', '{}', 'args-hash',
          'thread-recipe', 'project-recipe', '{}', 'full-access', 'default',
          'completed', 'recipe', '/repo/.nexi/recipes/machine-setup',
          NULL, NULL, NULL, NULL,
          '2026-10-26T14:12:00.000Z', '2026-10-26T14:13:00.000Z'
        )
      `;
      const facts = yield* readWorkflowRunFacts(sql, "thread-recipe");
      assert.strictEqual(facts.workflowRunStatus?.title, "machine-setup");
    }),
  );
});
