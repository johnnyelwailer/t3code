import { assert, it } from "@effect/vitest";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import {
  T3TeamChildThreadMetadata,
  T3TeamChildThreadMetadataLive,
} from "../../t3team-childThreadMetadata.ts";
import * as ThreadFactsStore from "../../t3team-v2/t3team-threadFactsStore.ts";
import {
  T3TeamThreadLineage,
  T3TeamThreadLineageError,
} from "../../t3team-v2/t3team-threadLineage.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "../../t3team-v2/t3team-v2Orchestrator.testkit.ts";
import * as ProjectionStore from "../ProjectionStore.ts";
import { runLegacyLineageCutover } from "./t3team-legacyLineageCutover.ts";

const makeLayer = (name: string) =>
  Layer.mergeAll(T3TeamChildThreadMetadataLive, ThreadFactsStore.layer).pipe(
    Layer.provideMerge(makeT3TeamV2TestLayer(name)),
    Layer.provide(SqlitePersistenceMemory),
  );

const id = (name: string) => ThreadId.make(`thread:cutover:${name}`);
const at = "2026-01-01T00:00:00.000Z";

const insertActivity = (activityId: string, threadId: string, kind: string, payload: string) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) => sql`INSERT INTO projection_thread_activities
      (activity_id, thread_id, turn_id, tone, kind, summary, payload_json, created_at)
      VALUES (${activityId}, ${threadId}, NULL, 'info', ${kind}, ${kind}, ${payload}, ${at})`,
  );

const lineageOf = (threadId: ThreadId) =>
  Effect.flatMap(ProjectionStore.ProjectionStoreV2, (store) => store.getThread(threadId)).pipe(
    Effect.map((thread) => thread.lineage),
  );

it.layer(makeLayer("t3team-legacy-lineage"))("runLegacyLineageCutover", (it) => {
  it.effect("re-links V1 children and forks on V2 lineage, once", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const names = ["root", "child", "grandchild", "started", "fork", "linked", "other"];
      for (const name of names) yield* createTestThread(id(name));
      // Grandchild first: the pass must still root it at "root".
      yield* insertActivity(
        "a1",
        id("grandchild"),
        "t3team.handoff.created",
        `{"parentThreadId":"${id("child")}"}`,
      );
      yield* insertActivity(
        "a2",
        id("child"),
        "t3team.handoff.created",
        `{"parentThreadId":"${id("root")}","ticketId":"PROJ-7"}`,
      );
      yield* insertActivity(
        "a3",
        id("root"),
        "t3team.handoff.started",
        `{"childThreadId":"${id("started")}"}`,
      );
      yield* insertActivity(
        "a4",
        id("missing"),
        "t3team.handoff.created",
        `{"parentThreadId":"${id("root")}"}`,
      );
      yield* insertActivity("a5", id("other"), "t3team.handoff.created", "not json");
      // Already linked in V2: the cutover must not override it.
      yield* (yield* T3TeamThreadLineage).setThreadLineage({
        threadId: id("linked"),
        parentThreadId: id("other"),
        relationshipToParent: "subagent",
      });
      yield* insertActivity(
        "a6",
        id("linked"),
        "t3team.handoff.created",
        `{"parentThreadId":"${id("root")}"}`,
      );
      const forkExt = `{"forkSource":{"threadId":"${id("root")}"}}`;
      yield* sql`INSERT INTO projection_thread_messages
        (message_id, thread_id, turn_id, role, text, is_streaming, created_at, updated_at, t3team_ext_json)
        VALUES ('m1', ${id("fork")}, NULL, 'system', 'Forked', 0, ${at}, ${at}, ${forkExt})`;
      yield* sql`INSERT INTO projection_threads (thread_id, project_id, title, created_at, updated_at,
        retention, environment_json) VALUES (${id("started")}, 'p', 't', ${at}, ${at}, 'ephemeral',
        '{"environmentId":"env-remote","label":"Remote"}')`;

      const summary = yield* runLegacyLineageCutover;
      assert.deepStrictEqual(summary, {
        linked: 4,
        unchanged: 2,
        skipped: 0,
        tickets: 1,
        facts: 2,
      });

      const rootId = (yield* lineageOf(id("root"))).rootThreadId;
      assert.deepStrictEqual(yield* lineageOf(id("child")), {
        parentThreadId: id("root"),
        relationshipToParent: "subagent",
        rootThreadId: rootId,
      });
      assert.strictEqual((yield* lineageOf(id("grandchild"))).rootThreadId, rootId);
      assert.strictEqual((yield* lineageOf(id("started"))).parentThreadId, id("root"));
      assert.deepStrictEqual(yield* lineageOf(id("fork")), {
        parentThreadId: id("root"),
        relationshipToParent: "fork",
        rootThreadId: rootId,
      });
      assert.strictEqual((yield* lineageOf(id("linked"))).parentThreadId, id("other"));

      const metadata = yield* (yield* T3TeamChildThreadMetadata).listByChildThreadIds([
        id("child"),
      ]);
      assert.strictEqual(metadata[0]?.ticketId, "PROJ-7");
      const facts = yield* (yield* ThreadFactsStore.T3TeamThreadFactsStore).get(id("started"));
      assert.strictEqual(facts?.retention, "ephemeral");
      assert.deepStrictEqual(facts?.environment, {
        environmentId: EnvironmentId.make("env-remote"),
        label: "Remote",
      });

      assert.isNull(yield* runLegacyLineageCutover);
    }),
  );
});

it.layer(makeLayer("t3team-legacy-lineage-upstream-db"))("runLegacyLineageCutover", (it) => {
  it.effect("tolerates a database without the fork's V1 tables and columns", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`DROP TABLE projection_thread_activities`;
      yield* sql`ALTER TABLE projection_thread_messages DROP COLUMN t3team_ext_json`;
      yield* sql`DROP TABLE projection_threads`;
      assert.deepStrictEqual(yield* runLegacyLineageCutover, {
        linked: 0,
        unchanged: 0,
        skipped: 0,
        tickets: 0,
        facts: 0,
      });
      // Children-of reads (settle guards, cascade) use the migration-91 expression index.
      const plan = yield* sql<{ readonly detail: string }>`EXPLAIN QUERY PLAN
        SELECT 1 FROM orchestration_v2_projection_threads c
        WHERE json_extract(c.payload_json, '$.lineage.parentThreadId') = 'thread:x'`;
      assert.isTrue(
        plan.some((row) => row.detail.includes("idx_t3team_v2_threads_lineage_parent")),
        plan.map((row) => row.detail).join("; "),
      );
      const ledger = yield* sql<{ readonly step: string }>`SELECT step FROM t3team_v2_cutover`;
      assert.deepStrictEqual(
        ledger.map((row) => row.step),
        ["v1-lineage"],
      );
    }),
  );
});

it.layer(makeLayer("t3team-legacy-lineage-retry"))("runLegacyLineageCutover", (it) => {
  it.effect("is not ledgered after a failed write and finishes the work on the retry", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      for (const name of ["root", "child", "linked-before"]) yield* createTestThread(id(name));
      yield* insertActivity(
        "r1",
        id("child"),
        "t3team.handoff.created",
        `{"parentThreadId":"${id("root")}","ticketId":"PROJ-1"}`,
      );
      yield* insertActivity(
        "r2",
        id("linked-before"),
        "t3team.handoff.created",
        `{"parentThreadId":"${id("root")}","ticketId":"PROJ-2"}`,
      );
      // An earlier attempt linked this child, then stopped before writing its ticket.
      yield* (yield* T3TeamThreadLineage).setThreadLineage({
        threadId: id("linked-before"),
        parentThreadId: id("root"),
        relationshipToParent: "subagent",
      });

      // A transient write failure (busy database, event sink) must not be ledgered as done.
      const failing = T3TeamThreadLineage.of({
        setThreadLineage: (input) =>
          Effect.fail(
            new T3TeamThreadLineageError({
              threadId: input.threadId,
              reason: "failed",
              cause: "database is locked",
            }),
          ),
      });
      assert.isNull(
        yield* runLegacyLineageCutover.pipe(Effect.provideService(T3TeamThreadLineage, failing)),
      );
      assert.deepStrictEqual(yield* sql`SELECT step FROM t3team_v2_cutover`, []);
      assert.isNull((yield* lineageOf(id("child"))).parentThreadId);

      assert.deepStrictEqual(yield* runLegacyLineageCutover, {
        linked: 1,
        unchanged: 1,
        skipped: 0,
        tickets: 2,
        facts: 0,
      });
      assert.strictEqual((yield* lineageOf(id("child"))).parentThreadId, id("root"));
      const metadata = yield* (yield* T3TeamChildThreadMetadata).listByChildThreadIds([
        id("child"),
        id("linked-before"),
      ]);
      assert.deepStrictEqual(metadata.map((row) => row.ticketId).toSorted(), ["PROJ-1", "PROJ-2"]);
    }),
  );
});
