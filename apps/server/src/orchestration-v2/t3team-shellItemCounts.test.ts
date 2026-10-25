import { assert, it } from "@effect/vitest";
import {
  EventId,
  MessageId,
  type ModelSelection,
  NodeId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Tracer from "effect/Tracer";
import * as SqlClient from "effect/sql/SqlClient";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ProjectionStore from "./ProjectionStore.ts";

const layerTest = ProjectionStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory));
const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5.4",
} satisfies ModelSelection;
const driver = ProviderDriverKind.make("codex");

const traceSqlStatements = () => {
  const statements: Array<string> = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      const end = span.end.bind(span);
      span.end = (endTime, exit) => {
        end(endTime, exit);
        const query = span.attributes.get("db.query.text");
        if (typeof query === "string") statements.push(query);
      };
      return span;
    },
  });
  return { statements, tracer };
};

const seedThread = Effect.fn("seedThread")(function* (
  suffix: string,
  runs: ReadonlyArray<{ readonly items: number; readonly status: "completed" | "rolled_back" }>,
) {
  const projectionStore = yield* ProjectionStore.ProjectionStoreV2;
  const now = yield* DateTime.now;
  const threadId = ThreadId.make(`thread:${suffix}`);
  yield* projectionStore.apply({
    id: EventId.make(`event:${suffix}:thread-created`),
    type: "thread.created",
    threadId,
    occurredAt: now,
    payload: {
      createdBy: "user",
      creationSource: "web",
      id: threadId,
      projectId: ProjectId.make(`project:${suffix}`),
      title: "Shell item counts",
      providerInstanceId: modelSelection.instanceId,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
      forkedFrom: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
  });
  for (const [index, { items, status }] of runs.entries()) {
    const runId = RunId.make(`run:${suffix}:${index}`);
    const nodeId = NodeId.make(`node:${suffix}:${index}`);
    const run = {
      id: runId,
      threadId,
      ordinal: index + 1,
      providerInstanceId: modelSelection.instanceId,
      modelSelection,
      providerThreadId: null,
      userMessageId: MessageId.make(`message:${suffix}:${index}`),
      rootNodeId: nodeId,
      activeAttemptId: null,
      status,
      requestedAt: now,
      startedAt: now,
      completedAt: now,
      checkpointId: null,
      contextHandoffId: null,
    };
    const base = { threadId, runId, nodeId, driver, occurredAt: now };
    yield* projectionStore.apply({
      ...base,
      id: EventId.make(`event:${suffix}:${index}:run`),
      type: "run.created",
      providerInstanceId: modelSelection.instanceId,
      payload: run,
    });
    for (let item = 0; item < items; item++) {
      yield* projectionStore.apply({
        ...base,
        id: EventId.make(`event:${suffix}:${index}:item:${item}`),
        type: "turn-item.updated",
        payload: {
          id: TurnItemId.make(`item:${suffix}:${index}:${item}`),
          threadId,
          runId,
          nodeId,
          providerThreadId: null,
          providerTurnId: null,
          nativeItemRef: null,
          parentItemId: null,
          ordinal: index * 100 + item + 1,
          status: "completed",
          title: "command",
          startedAt: now,
          completedAt: now,
          updatedAt: now,
          type: "command_execution",
          input: "true",
        },
      });
    }
  }
  return threadId;
});

const countsMatchItems = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const maintained = yield* sql`
    SELECT thread_id, run_key, item_count FROM orchestration_v2_projection_thread_item_counts
    ORDER BY thread_id, run_key`;
  const recounted = yield* sql`
    SELECT thread_id, COALESCE(run_id, '') AS run_key, COUNT(*) AS item_count
    FROM orchestration_v2_projection_turn_items
    GROUP BY thread_id, COALESCE(run_id, '') ORDER BY thread_id, run_key`;
  assert.deepEqual(maintained, recounted);
});

it.layer(layerTest)("shell item counts", (it) => {
  it.effect("reads counts without walking every turn item of every thread", () =>
    Effect.gen(function* () {
      const projectionStore = yield* ProjectionStore.ProjectionStoreV2;
      const sql = yield* SqlClient.SqlClient;
      const threadId = yield* seedThread("plan", [
        { items: 3, status: "completed" },
        { items: 2, status: "rolled_back" },
      ]);

      const { statements, tracer } = traceSqlStatements();
      const snapshot = yield* projectionStore.getShellSnapshot().pipe(Effect.withTracer(tracer));
      assert.equal(snapshot.threads.find((thread) => thread.id === threadId)?.itemCount, 3);

      const shellStatement = statements.find((statement) =>
        statement.includes("forked_from_run_source_thread_id"),
      );
      assert.isDefined(shellStatement);
      const plan = (yield* sql.unsafe<{ readonly detail: string }>(
        `EXPLAIN QUERY PLAN ${shellStatement}`,
      )).map((row) => row.detail);
      assert.notInclude(
        plan,
        "SEARCH i USING COVERING INDEX orchestration_v2_projection_turn_items_thread_run_idx (thread_id=?)",
      );
      assert.include(
        plan,
        "SEARCH message USING INDEX orchestration_v2_projection_messages_latest_user_authored_idx (thread_id=?)",
      );
      // Upstream reads the counts in their own statement; it must hit the maintained table.
      const countStatement = statements.find((statement) =>
        statement.includes("runless_item_count"),
      );
      assert.isDefined(countStatement);
      const countPlan = (yield* sql.unsafe<{ readonly detail: string }>(
        `EXPLAIN QUERY PLAN ${countStatement}`,
      )).map((row) => row.detail);
      assert.include(countPlan, "SEARCH counts USING PRIMARY KEY (thread_id=?)");
      assert.isFalse(
        countPlan.some((detail) => detail.includes("orchestration_v2_projection_turn_items")),
      );
    }),
  );

  it.effect("keeps the counts exact through inserts, re-parenting and deletes", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* seedThread("a", [{ items: 4, status: "completed" }]);
      yield* seedThread("b", [
        { items: 2, status: "completed" },
        { items: 1, status: "completed" },
      ]);
      yield* countsMatchItems;

      yield* sql`UPDATE orchestration_v2_projection_turn_items SET run_id = NULL
        WHERE turn_item_id = 'item:a:0:0'`;
      yield* sql`UPDATE orchestration_v2_projection_turn_items SET thread_id = 'thread:b'
        WHERE turn_item_id = 'item:a:0:1'`;
      yield* sql`UPDATE orchestration_v2_projection_turn_items SET status = 'failed'
        WHERE turn_item_id = 'item:a:0:2'`;
      yield* countsMatchItems;

      yield* sql`DELETE FROM orchestration_v2_projection_turn_items WHERE turn_item_id = 'item:b:1:0'`;
      yield* countsMatchItems;
      const emptiedRun = yield* sql`SELECT 1 FROM orchestration_v2_projection_thread_item_counts
        WHERE thread_id = 'thread:b' AND run_key = 'run:b:1'`;
      assert.lengthOf(emptiedRun, 0);

      yield* sql`DELETE FROM orchestration_v2_projection_turn_items`;
      yield* countsMatchItems;
    }),
  );
});
