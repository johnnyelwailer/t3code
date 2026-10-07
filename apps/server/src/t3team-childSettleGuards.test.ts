import { assert, it } from "@effect/vitest";
import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { T3TeamSettleGuardsLive } from "./t3team-childSettleGuards.ts";
import { SETTLED_PARENT_SETTLE_COMMAND_PREFIX } from "./t3team-childSettleSweepDecide.ts";
import { makeChildSettleSweeper } from "./t3team-childSettleSweeper.ts";
import { T3TeamThreadLineage } from "./t3team-v2/t3team-threadLineage.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";

const TestLayer = makeT3TeamV2TestLayer(
  "t3team-child-settle-guards",
  T3TeamSettleGuardsLive.pipe(Layer.provide(SqlitePersistenceMemory), Layer.orDie),
);

let sequence = 0;
const commandId = (prefix = "user") => CommandId.make(`${prefix}:${++sequence}`);

const family = (name: string) =>
  Effect.gen(function* () {
    const parent = ThreadId.make(`thread:${name}:parent`);
    const child = ThreadId.make(`thread:${name}:child`);
    yield* createTestThread(parent, "Parent");
    yield* createTestThread(child, "Child");
    yield* (yield* T3TeamThreadLineage).setThreadLineage({
      threadId: child,
      parentThreadId: parent,
      relationshipToParent: "subagent",
    });
    return { parent, child };
  });

const settle = (threadId: ThreadId, id = commandId()) =>
  Effect.flatMap(Orchestrator.OrchestratorV2, (orchestrator) =>
    orchestrator.dispatch({ type: "thread.settle", commandId: id, threadId }),
  ).pipe(Effect.exit);

const settledOverride = (threadId: ThreadId) =>
  Effect.flatMap(Orchestrator.OrchestratorV2, (orchestrator) =>
    orchestrator.getThreadShell(threadId),
  ).pipe(Effect.map((shell) => shell?.settledOverride ?? null));

it.layer(TestLayer)("t3team child settle guards", (it) => {
  it.effect("refuses to settle a parent with a live child, then allows it", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const { parent, child } = yield* family("live");
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: commandId(),
        threadId: child,
        messageId: MessageId.make("message:live-child"),
        text: "work",
        attachments: [],
        dispatchMode: { type: "defer_start" },
        createdBy: "user",
        creationSource: "web",
      });
      assert.strictEqual((yield* settle(parent))._tag, "Failure");
      assert.isNull(yield* settledOverride(parent));
    }),
  );

  it.effect("refuses to settle a thread whose workflow run is unfinished", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { parent } = yield* family("workflow");
      yield* sql`INSERT INTO workflow_runs (run_id, workflow_path, args_json, args_hash,
        launch_thread_id, project_id, model_json, runtime_mode, interaction_mode, status,
        created_at, updated_at) VALUES ('run:wf', '/w.ts', '{}', 'h', ${parent}, 'p', '{}',
        'full-access', 'default', 'running', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`;
      assert.strictEqual((yield* settle(parent))._tag, "Failure");
      yield* sql`UPDATE workflow_runs SET status = 'completed' WHERE run_id = 'run:wf'`;
      assert.strictEqual((yield* settle(parent))._tag, "Success");
    }),
  );

  it.effect("refuses to settle a child whose result its unsettled parent still waits for", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { parent, child } = yield* family("wait");
      const payload = '{"completionDelivery":{"state":"pending","observedByRunId":null}}';
      yield* sql`INSERT INTO orchestration_v2_projection_subagents (subagent_id, thread_id,
        parent_node_id, provider, child_thread_id, origin, status, updated_at, payload_json)
        VALUES ('node:wait', ${parent}, 'node:parent', 'codex', ${child}, 'app_owned',
        'completed', '2026-01-01T00:00:00.000Z', ${payload})`;
      assert.strictEqual((yield* settle(child))._tag, "Failure");
      // Once the parent is settled nobody consumes the delivery any more.
      assert.strictEqual((yield* settle(parent))._tag, "Success");
      assert.strictEqual((yield* settle(child))._tag, "Success");
    }),
  );

  it.effect(
    "settles children of a settled parent through auto-settle; a reopened parent wins",
    () =>
      Effect.gen(function* () {
        const orchestrator = yield* Orchestrator.OrchestratorV2;
        const { parent, child } = yield* family("sweep");
        const sweeper = makeChildSettleSweeper(
          {
            listShells: orchestrator.getShellSnapshot().pipe(Effect.map((s) => s.threads)),
            autoSettle: ({ commandId: id, threadId, snapshotAt }) =>
              orchestrator.dispatch({
                type: "thread.auto-settle",
                commandId: id,
                threadId,
                snapshotAt,
              }),
          },
          { startedAtMs: 0 },
        );
        yield* sweeper.sweepOnce(Date.parse("2026-01-01T00:00:00Z"));
        assert.isNull(yield* settledOverride(child));

        // Race: the sweep saw the parent settled, the user reopened it before the decision.
        const shell = yield* orchestrator.getThreadShell(child);
        const racing = yield* orchestrator
          .dispatch({
            type: "thread.auto-settle",
            commandId: CommandId.make(`${SETTLED_PARENT_SETTLE_COMMAND_PREFIX}race`),
            threadId: child,
            snapshotAt: shell!.updatedAt,
          })
          .pipe(Effect.exit);
        assert.strictEqual(racing._tag, "Failure");

        assert.strictEqual((yield* settle(parent))._tag, "Success");
        yield* sweeper.sweepOnce(Date.parse("2026-01-01T00:00:00Z"));
        assert.strictEqual(yield* settledOverride(child), "settled");
      }),
  );
});
