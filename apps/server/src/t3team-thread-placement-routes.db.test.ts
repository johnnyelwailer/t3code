import { assert, it } from "@effect/vitest";
import { Schema } from "effect";
const JsonString = Schema.fromJsonString(Schema.Unknown);
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "./persistence/Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { loadT3TeamThreadPlacements } from "./t3team-thread-placement-routes.ts";
import {
  T3TeamThreadToolContextStore,
  T3TeamThreadToolContextStoreLive,
} from "./t3team-threadToolContextStore.ts";

const layer = it.layer(
  Layer.mergeAll(NodeSqliteClient.layerMemory(), T3TeamThreadToolContextStoreLive),
);

function insertThread(threadId: string, retention: "ephemeral" | "retained" | null = null) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO projection_threads (
        thread_id, project_id, title, created_at, updated_at, retention
      ) VALUES (
        ${threadId}, 'project-1', ${threadId}, '2026-09-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z', COALESCE(${retention}, 'retained')
      )
    `;
  });
}

function insertActivity(input: {
  readonly activityId: string;
  readonly threadId: string;
  readonly kind: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const payloadJson = yield* Schema.encodeUnknownEffect(JsonString)(input.payload);
    yield* sql`
      INSERT INTO projection_thread_activities (
        activity_id, thread_id, turn_id, tone, kind, summary, payload_json, created_at
      ) VALUES (
        ${input.activityId}, ${input.threadId}, NULL, 'info', ${input.kind}, ${input.kind},
        ${payloadJson}, ${input.createdAt}
      )
    `;
  });
}

layer("loadT3TeamThreadPlacements (GHE #382)", (it) => {
  it.effect("resolves parent + ticket from handoff rows in a single batch", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const sql = yield* SqlClient.SqlClient;

      yield* insertThread("parent");
      yield* insertThread("child-created");
      yield* insertThread("child-started");
      yield* insertThread("child-ephemeral", "ephemeral");
      yield* insertThread("standalone");

      // Older + newer `handoff.created` rows: the newest one must win.
      yield* insertActivity({
        activityId: "a1",
        threadId: "child-created",
        kind: "t3team.handoff.created",
        payload: { parentThreadId: "stale-parent", ticketId: "OLD-1" },
        createdAt: "2026-09-01T00:00:01.000Z",
      });
      yield* insertActivity({
        activityId: "a2",
        threadId: "child-created",
        kind: "t3team.handoff.created",
        payload: { parentThreadId: " parent ", ticketId: "PROJ-42" },
        createdAt: "2026-09-01T00:00:02.000Z",
      });
      // Parent-side `handoff.started` row pointing at the child.
      yield* insertActivity({
        activityId: "a3",
        threadId: "parent",
        kind: "t3team.handoff.started",
        payload: { childThreadId: "child-started" },
        createdAt: "2026-09-01T00:00:03.000Z",
      });
      // Ephemeral child: placement row must not revive it.
      yield* insertActivity({
        activityId: "a4",
        threadId: "child-ephemeral",
        kind: "t3team.handoff.created",
        payload: { parentThreadId: "parent" },
        createdAt: "2026-09-01T00:00:04.000Z",
      });
      // Unrelated activity kinds are ignored.
      yield* insertActivity({
        activityId: "a5",
        threadId: "standalone",
        kind: "turn.completed",
        payload: { parentThreadId: "not-a-handoff" },
        createdAt: "2026-09-01T00:00:05.000Z",
      });

      const store = yield* T3TeamThreadToolContextStore;
      yield* store.put({
        threadId: ThreadId.make("child-started"),
        toolContext: {
          surface: "t3team",
          tools: [],
          state: { view: { kind: "thread", ticketId: "PROJ-7" } },
        } as never,
      });

      const placements = yield* loadT3TeamThreadPlacements([
        "child-created",
        "child-started",
        "child-ephemeral",
        "standalone",
        "unknown-thread",
      ]);

      assert.deepStrictEqual(placements, [
        { threadId: "child-created", parentThreadId: "parent", ticketId: "PROJ-42" },
        { threadId: "child-started", parentThreadId: "parent", ticketId: "PROJ-7" },
      ]);

      // The kind index exists and is what the started-lookup uses.
      const plan = yield* sql<{ readonly detail: string }>`
        EXPLAIN QUERY PLAN
        SELECT thread_id FROM projection_thread_activities WHERE kind = 't3team.handoff.started'
      `;
      const planJson = yield* Schema.encodeUnknownEffect(JsonString)(plan);
      assert.ok(
        plan.some((row) => row.detail.includes("idx_projection_thread_activities_kind_created")),
        planJson,
      );
    }),
  );

  it.effect("handles more ids than one bound-parameter chunk", () =>
    Effect.gen(function* () {
      yield* runMigrations();
      const ids = Array.from({ length: 1000 }, (_, index) => `thread-${index}`);
      yield* insertThread("thread-999");
      yield* insertActivity({
        activityId: "big",
        threadId: "thread-999",
        kind: "t3team.handoff.created",
        payload: { parentThreadId: "parent" },
        createdAt: "2026-09-01T00:00:00.000Z",
      });

      const placements = yield* loadT3TeamThreadPlacements(ids);
      assert.deepStrictEqual(placements, [{ threadId: "thread-999", parentThreadId: "parent" }]);
    }),
  );

  it.effect("binds the handoff.started lookup to the requested child ids in SQL", () =>
    Effect.gen(function* () {
      yield* runMigrations();

      yield* insertThread("child-a");
      yield* insertThread("child-b");
      yield* insertThread("parent-a-old");
      yield* insertThread("parent-a-new");
      yield* insertThread("parent-b");
      yield* insertThread("unrelated-parent");
      yield* insertThread("child-with-number");

      // child-a has two started rows; the newest wins (identical contract to
      // the former in-memory newest-per-child reduce).
      yield* insertActivity({
        activityId: "s-a-old",
        threadId: "parent-a-old",
        kind: "t3team.handoff.started",
        payload: { childThreadId: "child-a" },
        createdAt: "2026-09-01T00:00:01.000Z",
      });
      yield* insertActivity({
        activityId: "s-a-new",
        threadId: "parent-a-new",
        kind: "t3team.handoff.started",
        payload: { childThreadId: "child-a" },
        createdAt: "2026-09-01T00:00:02.000Z",
      });
      yield* insertActivity({
        activityId: "s-b",
        threadId: "parent-b",
        kind: "t3team.handoff.started",
        payload: { childThreadId: "child-b" },
        createdAt: "2026-09-01T00:00:03.000Z",
      });
      // Not requested: the SQL-bound query must not even return this row,
      // instead of fetching it and dropping it in JS.
      yield* insertActivity({
        activityId: "s-other",
        threadId: "unrelated-parent",
        kind: "t3team.handoff.started",
        payload: { childThreadId: "child-unrequested" },
        createdAt: "2026-09-01T00:00:04.000Z",
      });
      // Type contract: a numeric childThreadId must not match the text id "42" —
      // json_extract is type-aware, so an INTEGER payload value never equals a
      // bound TEXT parameter.
      yield* insertActivity({
        activityId: "s-number",
        threadId: "unrelated-parent",
        kind: "t3team.handoff.started",
        payload: { childThreadId: 42 },
        createdAt: "2026-09-01T00:00:05.000Z",
      });

      const placements = yield* loadT3TeamThreadPlacements([
        "child-a",
        "child-b",
        "child-with-number",
        "42",
      ]);

      assert.deepStrictEqual(placements, [
        { threadId: "child-a", parentThreadId: "parent-a-new" },
        { threadId: "child-b", parentThreadId: "parent-b" },
      ]);
    }),
  );
});
