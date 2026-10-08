import { assert, it } from "@effect/vitest";
import { CommandId, MessageId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { WorkflowRunRepository, WorkflowRunRepositoryLive } from "./persistence/WorkflowRuns.ts";
import {
  ACTIVE_WORKFLOW_STATUSES,
  makeChildSettleGuardChecks,
  T3TeamSettleGuardsLive,
} from "./t3team-childSettleGuards.ts";
import { SETTLED_PARENT_SETTLE_COMMAND_PREFIX } from "./t3team-childSettleSweepDecide.ts";
import { makeChildSettleSweeper } from "./t3team-childSettleSweeper.ts";
import {
  stopParkedWorkflowRunsForSettle,
  type SettleParkedWorkflowStopDeps,
} from "./t3team-settleParkedWorkflowStop.ts";
import { T3TeamThreadLineage } from "./t3team-v2/t3team-threadLineage.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";
import { buildRunningWorkflowRunRow } from "./t3team-workflowEngineDurability.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeFakeWorkflowHostLayer } from "./t3team-workflowHostFake.fixtures.ts";

const TestLayer = WorkflowRunRepositoryLive.pipe(
  Layer.provideMerge(
    makeT3TeamV2TestLayer(
      "t3team-child-settle-guards",
      T3TeamSettleGuardsLive.pipe(Layer.provide(SqlitePersistenceMemory), Layer.orDie),
    ),
  ),
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

const insertRun = (threadId: ThreadId, runId: string, status: string) =>
  Effect.gen(function* () {
    yield* (yield* WorkflowRunRepository).upsert(
      buildRunningWorkflowRunRow({
        runId,
        workflowPath: "/tmp/never-read.workflow.ts",
        args: {},
        launchThreadId: String(threadId),
        projectId: ProjectId.make("project:t3team-v2"),
        modelSelection: createModelSelection(ProviderInstanceId.make("inst-1"), "model-x"),
        runtimeMode: "full-access",
        interactionMode: "default",
        nowIso: "2026-01-01T00:00:00.000Z",
      }),
    );
    const sql = yield* SqlClient.SqlClient;
    yield* sql`UPDATE workflow_runs SET status = ${status} WHERE run_id = ${runId}`;
  });

const runStatus = (runId: string) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) => sql<{ status: string }>`SELECT status FROM workflow_runs WHERE run_id = ${runId}`,
  ).pipe(Effect.map(([row]) => row?.status));

const stopDeps = Effect.gen(function* () {
  const deps: SettleParkedWorkflowStopDeps = {
    control: {
      repo: yield* WorkflowRunRepository,
      registry: makeWorkflowEngineRegistry(),
      host: makeFakeWorkflowHostLayer().service,
      rearmScheduler: () => Promise.resolve(),
      nowIso: () => "2026-01-02T00:00:00.000Z",
    },
    guardIgnoringParkedRuns: yield* makeChildSettleGuardChecks(ACTIVE_WORKFLOW_STATUSES),
  };
  return deps;
});

const failureText = (exit: { readonly _tag: string; readonly cause?: Cause.Cause<unknown> }) =>
  exit._tag === "Failure" && exit.cause !== undefined ? Cause.pretty(exit.cause) : "";

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

  it.effect("a user settle stops parked workflow runs, then settles", () =>
    Effect.gen(function* () {
      const { parent } = yield* family("parked");
      yield* insertRun(parent, "run:parked-sleeping", "sleeping");
      yield* insertRun(parent, "run:parked-paused", "paused");
      const id = commandId();
      const stopped = yield* stopParkedWorkflowRunsForSettle(yield* stopDeps, {
        threadId: parent,
        commandId: id,
      });
      assert.deepStrictEqual([...stopped].sort(), ["run:parked-paused", "run:parked-sleeping"]);
      assert.strictEqual(yield* runStatus("run:parked-sleeping"), "cancelled");
      assert.strictEqual(yield* runStatus("run:parked-paused"), "cancelled");
      assert.strictEqual((yield* settle(parent, id))._tag, "Success");
    }),
  );

  it.effect(
    "a running workflow run is never stopped; the refusal names it and how to stop it",
    () =>
      Effect.gen(function* () {
        const { parent } = yield* family("running");
        yield* insertRun(parent, "run:busy-sleeping", "sleeping");
        yield* insertRun(parent, "run:busy-running", "running");
        const id = commandId();
        const stopped = yield* stopParkedWorkflowRunsForSettle(yield* stopDeps, {
          threadId: parent,
          commandId: id,
        });
        assert.deepStrictEqual(stopped, []);
        assert.strictEqual(yield* runStatus("run:busy-sleeping"), "sleeping");
        const message = failureText(yield* settle(parent, id));
        assert.include(message, "run:busy-running (running)");
        assert.include(message, "Stop button");
        assert.include(message, "t3_orchestration_stop");
      }),
  );

  it.effect("parked runs stay when another blocker would refuse the settle anyway", () =>
    Effect.gen(function* () {
      const { parent, child } = yield* family("blocked");
      yield* insertRun(parent, "run:blocked-sleeping", "sleeping");
      yield* insertRun(child, "run:blocked-child", "watching");
      const id = commandId();
      const stopped = yield* stopParkedWorkflowRunsForSettle(yield* stopDeps, {
        threadId: parent,
        commandId: id,
      });
      assert.deepStrictEqual(stopped, []);
      assert.strictEqual(yield* runStatus("run:blocked-sleeping"), "sleeping");
      // The child's own settle is the way out; the refusal says so.
      const childRefusal = yield* makeChildSettleGuardChecks(ACTIVE_WORKFLOW_STATUSES).pipe(
        Effect.flatMap((check) => check({ threadId: parent, commandId: id, origin: "user" })),
      );
      assert.include(childRefusal ?? "", `live child thread ${child}`);
      assert.include(childRefusal ?? "", "run:blocked-child (watching)");
    }),
  );

  it.effect("automatic settles never stop parked runs and are still refused", () =>
    Effect.gen(function* () {
      const { parent } = yield* family("automatic");
      yield* insertRun(parent, "run:auto-sleeping", "sleeping");
      const deps = yield* stopDeps;
      for (const prefix of [SETTLED_PARENT_SETTLE_COMMAND_PREFIX, "server:auto-settle:"]) {
        const id = commandId(`${prefix}x`);
        assert.deepStrictEqual(
          yield* stopParkedWorkflowRunsForSettle(deps, { threadId: parent, commandId: id }),
          [],
        );
      }
      assert.strictEqual(yield* runStatus("run:auto-sleeping"), "sleeping");
      const refusal = failureText(yield* settle(parent, commandId("server:auto-settle:y")));
      assert.include(refusal, "run:auto-sleeping (sleeping)");
      assert.isNull(yield* settledOverride(parent));
    }),
  );
});
