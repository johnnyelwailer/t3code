/**
 * H0 — the SQLite bounded-SQL replay-window read (bounded-execution.md, phase 2):
 * `SqliteJournalStore.readReplayWindow` must materialize only the rows a resume needs — the
 * json_extract checkpoint scan, the `seq > boundary` suffix, the prefix `sent` rows for
 * unsettled-ask detection, the full `resolved` map, and the lifetime COUNT — instead of the
 * whole journal. The host-neutral conformance suite (t3team-SqliteJournalStoreReplayWindow.test.ts)
 * is the equivalence proof against the full-read reference; these tests pin the store-level
 * behavior the conformance fixtures do not exercise: bounded materialization, the boundary
 * conditions (latest VALID checkpoint, strict suffix exclusion), the lifetime totals, and
 * store-level parity with `selectReplayWindow` over the store's own full read.
 */
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import {
  selectReplayWindow,
  type JournalEntry,
  type JournalStore,
  type ResolvedWireInput,
  type ReplayWindow,
} from "@t3team/sdk";

import { SqlitePersistenceMemory } from "./Sqlite.ts";
import { buildSqliteJournalStore } from "./SqliteJournalStore.ts";

const NOW = "2026-10-01T00:00:00.000Z";

const callEntry = (seq: number, result: unknown): JournalEntry => ({
  seq,
  callId: `${seq}:tool:ref`,
  kind: "tool",
  refId: "ref",
  argsHash: `hash-${seq}`,
  result,
  startedAt: NOW,
  endedAt: NOW,
});
const sentEntry = (seq: number, kind: string, correlationId: string): JournalEntry => ({
  seq,
  callId: `${seq}:${kind}:${correlationId}`,
  kind,
  refId: "ref",
  argsHash: `hash-${seq}`,
  result: undefined,
  phase: "sent",
  correlationId,
  startedAt: NOW,
  endedAt: NOW,
});
const checkpointEntry = (
  seq: number,
  compactedThroughSeq: number,
  state: unknown,
): JournalEntry => ({
  seq,
  callId: `${seq}:checkpoint:checkpoint`,
  kind: "checkpoint",
  refId: "checkpoint",
  argsHash: `hash-${seq}`,
  result: { compactedThroughSeq, state, retainedHistory: 0, at: NOW },
  startedAt: NOW,
  endedAt: NOW,
});
/** A checkpoint whose result is NOT a valid CheckpointRecord (the corrupt-boundary case). */
const corruptCheckpointEntry = (seq: number): JournalEntry => ({
  seq,
  callId: `${seq}:checkpoint:checkpoint`,
  kind: "checkpoint",
  refId: "checkpoint",
  argsHash: `hash-${seq}`,
  result: { compactedThroughSeq: "not-a-seq", state: {}, retainedHistory: 0, at: NOW },
  startedAt: NOW,
  endedAt: NOW,
});

const reply = (correlationId: string, kind: string, value: unknown): ResolvedWireInput => ({
  correlationId,
  kind,
  refId: "ref",
  reply: value,
  startedAt: NOW,
  endedAt: NOW,
});

/** The H0 store always implements the window; narrow the optional seam and fail loud if not. */
const readWindow = (store: JournalStore, runId: string): Promise<ReplayWindow> => {
  const fn = store.readReplayWindow;
  if (fn === undefined) {
    throw new Error("the H0 SQLite store must implement readReplayWindow");
  }
  return fn(runId);
};

/** A plain-object snapshot of a window — the same content the conformance harness compares. */
const windowSnapshot = (window: ReplayWindow) => ({
  checkpoint: window.checkpoint ?? null,
  suffix: [...window.entries.bySeq.values()]
    .map((e) => ({
      seq: e.seq,
      kind: e.kind,
      refId: e.refId,
      result: e.result === undefined ? null : e.result,
      phase: e.phase ?? null,
      correlationId: e.correlationId ?? null,
    }))
    .sort((a, b) => a.seq - b.seq),
  correlationIds: [...window.entries.byCorrelation.keys()].sort(),
  totalEntries: window.totalEntries,
  materializedEntries: window.materializedEntries,
  unresolvedPrefixCorrelationIds: [...window.unresolvedPrefixCorrelationIds].sort(),
});

const seqs = (window: ReplayWindow): number[] =>
  [...window.entries.bySeq.keys()].sort((a, b) => a - b);

const layer = it.layer(SqlitePersistenceMemory);

layer("SqliteJournalStore bounded-SQL replay-window read (H0)", (it) => {
  it.effect(
    "materializes only the checkpoint suffix; keeps the full correlation map + lifetime totals",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const store = buildSqliteJournalStore(sql);
        const runId = "h0-bounded";
        for (const entry of [
          callEntry(1, "a"),
          callEntry(2, "b"),
          sentEntry(3, "wait.until", "h0-c3"),
          callEntry(4, "c"),
          checkpointEntry(5, 4, { i: 1 }),
          callEntry(6, "d"),
          callEntry(7, "e"),
          checkpointEntry(8, 7, { i: 2 }),
          callEntry(9, "f"),
        ]) {
          yield* Effect.promise(() => store.appendEntry(runId, entry));
        }
        yield* Effect.promise(() =>
          store.appendResolved(runId, reply("h0-c3", "wait.until", true)),
        );

        const window = yield* Effect.promise(() => readWindow(store, runId));
        assert.strictEqual(window.checkpoint?.seq, 8);
        assert.strictEqual(window.totalEntries, 9); // lifetime call/sent rows, not what was loaded
        assert.strictEqual(window.materializedEntries, 1); // strictly after seq 8 → only seq 9
        assert.deepStrictEqual(seqs(window), [9]);
        assert.strictEqual(window.entries.bySeq.has(8), false); // the boundary is replaced by its compact state
        assert.strictEqual(window.entries.byCorrelation.size, 1); // the full (settled) correlation map
        assert.deepStrictEqual(window.unresolvedPrefixCorrelationIds, []);
      }),
  );

  it.effect(
    "flags an unsettled resolvable ask collapsed by a checkpoint; one-way verbs excluded",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const store = buildSqliteJournalStore(sql);
        const runId = "h0-unsafe";
        for (const entry of [
          sentEntry(1, "wait.until", "h0-unsettled"),
          sentEntry(2, "thread.create", "h0-oneway"),
          callEntry(3, "a"),
          checkpointEntry(4, 3, { i: 1 }),
          callEntry(5, "b"),
        ]) {
          yield* Effect.promise(() => store.appendEntry(runId, entry));
        }

        const window = yield* Effect.promise(() => readWindow(store, runId));
        assert.strictEqual(window.checkpoint?.seq, 4);
        // Only the resolvable 'wait.until' ask is flagged; the one-way 'thread.create' never settles.
        assert.deepStrictEqual([...window.unresolvedPrefixCorrelationIds].sort(), ["h0-unsettled"]);
        assert.strictEqual(window.materializedEntries, 1);
      }),
  );

  it.effect("falls back to the full journal when no checkpoint is committed", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const store = buildSqliteJournalStore(sql);
      const runId = "h0-full";
      for (const entry of [callEntry(1, "a"), callEntry(2, "b"), callEntry(3, "c")]) {
        yield* Effect.promise(() => store.appendEntry(runId, entry));
      }

      const window = yield* Effect.promise(() => readWindow(store, runId));
      assert.strictEqual(window.checkpoint, undefined);
      assert.strictEqual(window.totalEntries, 3);
      assert.strictEqual(window.materializedEntries, 3);
      assert.deepStrictEqual(seqs(window), [1, 2, 3]);
    }),
  );

  it.effect(
    "a corrupt LATEST checkpoint falls back to the latest VALID one (json_extract scan + validity filter)",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const store = buildSqliteJournalStore(sql);
        const runId = "h0-corrupt-tail";
        for (const entry of [
          callEntry(1, "a"),
          checkpointEntry(4, 3, { i: 1 }),
          callEntry(5, "b"),
          corruptCheckpointEntry(6), // structurally invalid record — never authority
          callEntry(7, "c"),
        ]) {
          yield* Effect.promise(() => store.appendEntry(runId, entry));
        }

        const window = yield* Effect.promise(() => readWindow(store, runId));
        assert.strictEqual(window.checkpoint?.seq, 4); // the valid checkpoint, not the corrupt seq-6 row
        assert.deepStrictEqual(seqs(window), [5, 6, 7]); // the corrupt row replays as data
        assert.strictEqual(window.totalEntries, 5);
        assert.strictEqual(window.materializedEntries, 3);
      }),
  );

  it.effect(
    "matches the full-read reference selection on a mixed journal (store-level parity)",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const store = buildSqliteJournalStore(sql);
        const runId = "h0-parity";
        for (const entry of [
          callEntry(1, "a"),
          callEntry(2, "b"),
          sentEntry(3, "thread.create", "h0-p3"), // one-way: in the prefix, never flagged
          callEntry(4, "c"),
          sentEntry(5, "user.input", "h0-p5"),
          checkpointEntry(6, 5, { i: 3 }),
          callEntry(7, "d"),
          callEntry(8, "e"),
        ]) {
          yield* Effect.promise(() => store.appendEntry(runId, entry));
        }
        yield* Effect.promise(() =>
          store.appendResolved(runId, reply("h0-p5", "user.input", { ok: true })),
        );

        const bounded = yield* Effect.promise(() => readWindow(store, runId));
        const reference = selectReplayWindow(yield* Effect.promise(() => store.readEntries(runId)));
        assert.deepStrictEqual(windowSnapshot(bounded), windowSnapshot(reference));
        assert.strictEqual(bounded.checkpoint?.seq, 6);
        assert.deepStrictEqual(seqs(bounded), [7, 8]);
      }),
  );

  it.effect(
    "lifetime totals exclude resolved and meta rows; the meta row is never in the window",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const store = buildSqliteJournalStore(sql);
        const runId = "h0-meta";
        yield* Effect.promise(() =>
          store.writeRunMeta(runId, {
            workflowPath: "h0-meta.workflow.ts",
            argsHash: "args-meta",
            createdAt: NOW,
          }),
        );
        for (const entry of [
          callEntry(1, "a"),
          callEntry(2, "b"),
          sentEntry(3, "wait.until", "h0-m3"),
        ]) {
          yield* Effect.promise(() => store.appendEntry(runId, entry));
        }
        yield* Effect.promise(() =>
          store.appendResolved(runId, reply("h0-m3", "wait.until", true)),
        );

        const window = yield* Effect.promise(() => readWindow(store, runId));
        assert.strictEqual(window.totalEntries, 3); // call + call + sent — not the resolved or meta rows
        assert.strictEqual(window.materializedEntries, 3);
        assert.deepStrictEqual(seqs(window), [1, 2, 3]);
        assert.strictEqual(window.entries.byCorrelation.size, 1);
      }),
  );

  it.effect("a run holding only a meta row yields the empty window", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const store = buildSqliteJournalStore(sql);
      const runId = "h0-empty";
      yield* Effect.promise(() =>
        store.writeRunMeta(runId, {
          workflowPath: "h0-empty.workflow.ts",
          argsHash: "args-empty",
          createdAt: NOW,
        }),
      );

      const window = yield* Effect.promise(() => readWindow(store, runId));
      assert.strictEqual(window.checkpoint, undefined);
      assert.strictEqual(window.totalEntries, 0);
      assert.strictEqual(window.materializedEntries, 0);
      assert.strictEqual(window.entries.bySeq.size, 0);
      assert.strictEqual(window.entries.byCorrelation.size, 0);
      assert.deepStrictEqual(window.unresolvedPrefixCorrelationIds, []);
    }),
  );
});
