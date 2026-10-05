/**
 * H0 — the T3 Code server's SQLite journal store honors the bounded-replay contract
 * (docs/runbook/bounded-execution.md): the host-neutral replay-window conformance suite
 * passes against `buildSqliteJournalStore` — bounded suffix, deterministic rehydration,
 * no full replay when a window exists, and the engine's error shape when the window
 * cannot be honored. The same suite is the entry point wave-2 hosts run against their
 * own `JournalStore` implementations.
 */
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runReplayWindowConformance } from "@t3team/sdk";

import { SqlitePersistenceMemory } from "./Sqlite.ts";
import { buildSqliteJournalStore } from "./SqliteJournalStore.ts";

const layer = it.layer(SqlitePersistenceMemory);

layer("SqliteJournalStore bounded-replay conformance (H0)", (it) => {
  it.effect("passes the host-neutral replay-window conformance suite", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const report = yield* Effect.promise(() =>
        runReplayWindowConformance(buildSqliteJournalStore(sql)),
      );
      assert.isAbove(report.passed.length, 0);
      assert.include(
        report.passed,
        "conformance:bounded: window matches the shared reference selection",
      );
      assert.include(
        report.passed,
        "conformance:bounded: bounded suffix (no prefix entry materialized)",
      );
      assert.include(
        report.passed,
        "conformance:bounded: engine replays only the bounded suffix (no full replay) and seeds the boundary",
      );
      assert.include(
        report.passed,
        "conformance:bounded: deterministic rehydration (identical resume outcomes)",
      );
      assert.include(
        report.passed,
        "conformance:unsafe: store cannot honor the window: the engine fails loud (WorkflowError) before the body runs",
      );
      assert.include(
        report.passed,
        "conformance:long-lived: bounded suffix (no prefix entry materialized)",
      );
    }),
  );
});
