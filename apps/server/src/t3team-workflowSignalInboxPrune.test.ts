import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import * as SqlitePersistence from "./persistence/Sqlite.ts";
import { WorkflowSignalStore, WorkflowSignalStoreLive } from "./persistence/WorkflowSignalStore.ts";
import { makeReconcilerCore, UNDRAINED_INBOX_CAP } from "./t3team-workflowSignalReconcilerCore.ts";

const layer = WorkflowSignalStoreLive.pipe(Layer.provideMerge(SqlitePersistence.layerMemory));

const VIEWER = "scm.viewer.change-requests";
const insert = (
  store: WorkflowSignalStore["Service"],
  sourceName: string,
  key: string,
  createdAt: string,
) =>
  store.insertInboxEntry({
    sourceName,
    paramsHash: "h",
    signalName: "s",
    key,
    payload: {},
    createdAt,
  });

describe("bounded inbox for undrained sources", () => {
  it.effect("drops undelivered slots past the age cutoff and past the newest-N cap", () =>
    Effect.gen(function* () {
      const store = yield* WorkflowSignalStore;
      const sql = yield* SqlClient.SqlClient;
      yield* insert(store, VIEWER, "old", "2026-09-01T00:00:00Z");
      for (const n of [1, 2, 3, 4])
        yield* insert(store, VIEWER, `k${n}`, `2026-10-0${n}T00:00:00Z`);
      yield* insert(store, "scm.change-request.watch", "other-old", "2026-09-01T00:00:00Z");
      yield* store.pruneUndeliveredInboxEntries({
        sourceName: VIEWER,
        olderThanIso: "2026-09-15T00:00:00Z",
        keepNewest: 2,
      });
      const left = yield* sql<{ source_name: string; key: string }>`
        SELECT source_name, key FROM workflow_signal_inbox ORDER BY id`;
      assert.deepStrictEqual(
        left.map((row) => `${row.source_name}:${row.key}`),
        [`${VIEWER}:k3`, `${VIEWER}:k4`, "scm.change-request.watch:other-old"],
      );
    }).pipe(Effect.provide(layer)),
  );

  it.effect("leaves delivered slots to their own GC", () =>
    Effect.gen(function* () {
      const store = yield* WorkflowSignalStore;
      const sql = yield* SqlClient.SqlClient;
      yield* insert(store, VIEWER, "delivered", "2026-09-01T00:00:00Z");
      yield* sql`UPDATE workflow_signal_inbox SET delivered = 1, delivered_at = '2026-09-02T00:00:00Z'`;
      yield* store.pruneUndeliveredInboxEntries({
        sourceName: VIEWER,
        olderThanIso: "2026-10-01T00:00:00Z",
        keepNewest: 0,
      });
      const left = yield* sql<{ n: number }>`SELECT COUNT(*) AS n FROM workflow_signal_inbox`;
      assert.strictEqual(left[0]?.n, 1);
    }).pipe(Effect.provide(layer)),
  );

  it("runs on every sweep for the viewer source only, with the documented cap", async () => {
    const pruned: Array<{ sourceName: string; olderThanIso: string; keepNewest: number }> = [];
    const store = {
      listLiveRegistrations: () => Effect.succeed([]),
      purgeTerminalRegistrations: () => Effect.void,
      deleteDeliveredInboxEntriesOlderThan: () => Effect.void,
      pruneUndeliveredInboxEntries: (input: (typeof pruned)[number]) =>
        Effect.sync(() => void pruned.push(input)),
    };
    const core = makeReconcilerCore({
      catalog: { start: async () => ({}), sourceNames: new Set() },
      delivery: { emit: () => Effect.succeed(0) },
      store: store as never,
      inboxCutoffIso: () => "2026-10-01T00:00:00Z",
      nowIso: () => "2026-10-08T00:00:00Z",
      log: () => Effect.void,
    });
    await core.sweep();
    assert.deepStrictEqual(pruned, [
      { sourceName: VIEWER, olderThanIso: "2026-10-01T00:00:00Z", keepNewest: UNDRAINED_INBOX_CAP },
    ]);
  });
});
