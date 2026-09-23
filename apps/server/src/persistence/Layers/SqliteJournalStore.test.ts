/**
 * H0 — the T3 Code server's own `SqliteJournalStore` must implement `readReplayWindow` so a resumed
 * run rehydrates the BOUNDED checkpoint suffix instead of the full journal (bounded-execution.md,
 * phase 2). Each test runs inside `it.live` with the in-memory SQLite layer provided for that test's
 * duration (the repo's pattern — the `:memory:` DB is a resource that must stay open while the store
 * is driven), asserting (a) the store exposes the optional method, (b) it returns the correct bounded
 * window over a real SQLite database, and (c) it passes the host-agnostic replay-window conformance
 * suite the same way the filesystem reference does.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  runReplayWindowConformance,
  type JournalEntry,
  type ReplayWindowConformanceStore,
  type ResolvedWireInput,
} from "@t3team/sdk";
import { it } from "@effect/vitest";
import { expect } from "vite-plus/test";

import { buildSqliteJournalStore } from "./SqliteJournalStore.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const NOW = "2026-09-01T00:00:00.000Z";

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
const checkpointEntry = (seq: number, compactedThroughSeq: number, state: unknown): JournalEntry => ({
  seq,
  callId: `${seq}:checkpoint:checkpoint`,
  kind: "checkpoint",
  refId: "checkpoint",
  argsHash: `hash-${seq}`,
  result: { compactedThroughSeq, state, retainedHistory: 0, at: NOW },
  startedAt: NOW,
  endedAt: NOW,
});

// The in-memory SQLite layer lives for the duration of each test that provides it (the `:memory:` DB
// is an Effect resource that would otherwise finalize as soon as the effect that opened it completes).
const TestLayer = Layer.mergeAll(SqlitePersistenceMemory, NodeServices.layer);
const buildStore: Effect.Effect<ReplayWindowConformanceStore, never, SqlClient.SqlClient> = Effect.gen(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    // buildSqliteJournalStore now always provides readReplayWindow; the interface keeps it optional
    // for backends that stay full-replay.
    return buildSqliteJournalStore(sql) as unknown as ReplayWindowConformanceStore;
  },
);

const seqs = (window: { readonly entries: { readonly bySeq: Map<number, unknown> } }): number[] =>
  [...window.entries.bySeq.keys()].sort((a, b) => a - b);

it.live("exposes the optional readReplayWindow method (the H0 gap this PR closes)", () =>
  Effect.gen(function* () {
    const store = yield* buildStore;
    expect(typeof store.readReplayWindow).toBe("function");
  }).pipe(Effect.provide(TestLayer)),
);

it.live("materializes only the checkpoint suffix and keeps the full correlation map + lifetime totals", () =>
  Effect.gen(function* () {
    const store = yield* buildStore;
    const runId = "h0-bounded";
    yield* Effect.all(
      [
        store.appendEntry(runId, callEntry(1, "a")),
        store.appendEntry(runId, callEntry(2, "b")),
        store.appendEntry(runId, sentEntry(3, "wait.until", "h0-c3")),
        store.appendEntry(runId, callEntry(4, "c")),
        store.appendEntry(runId, checkpointEntry(5, 4, { i: 1 })),
        store.appendEntry(runId, callEntry(6, "d")),
        store.appendEntry(runId, callEntry(7, "e")),
        store.appendEntry(runId, checkpointEntry(8, 7, { i: 2 })),
        store.appendEntry(runId, callEntry(9, "f")),
        store.appendResolved(runId, {
          correlationId: "h0-c3",
          kind: "wait.until",
          refId: "ref",
          reply: true,
          startedAt: NOW,
          endedAt: NOW,
        } satisfies ResolvedWireInput),
      ].map((p) => Effect.promise(() => p)),
    );

    const window = yield* Effect.promise(() => store.readReplayWindow(runId));
    expect(window.checkpoint?.seq).toBe(8);
    expect(window.totalEntries).toBe(9); // lifetime call/sent rows, not what was loaded
    expect(window.materializedEntries).toBe(1); // strictly after seq 8 → only seq 9
    expect(seqs(window)).toEqual([9]);
    expect(window.entries.bySeq.has(8)).toBe(false); // the boundary is replaced by its compact state
    expect(window.entries.byCorrelation.size).toBe(1); // the full (settled) correlation map
    expect(window.unresolvedPrefixCorrelationIds).toEqual([]);
  }).pipe(Effect.provide(TestLayer)),
);

it.live("reports an unsettled resolvable ask collapsed by a checkpoint (one-way verbs excluded)", () =>
  Effect.gen(function* () {
    const store = yield* buildStore;
    const runId = "h0-unsafe";
    yield* Effect.all(
      [
        store.appendEntry(runId, sentEntry(1, "wait.until", "h0-unsettled")),
        store.appendEntry(runId, sentEntry(2, "thread.create", "h0-oneway")),
        store.appendEntry(runId, callEntry(3, "a")),
        store.appendEntry(runId, checkpointEntry(4, 3, { i: 1 })),
        store.appendEntry(runId, callEntry(5, "b")),
      ].map((p) => Effect.promise(() => p)),
    );

    const window = yield* Effect.promise(() => store.readReplayWindow(runId));
    expect(window.checkpoint?.seq).toBe(4);
    // only the resolvable 'wait.until' ask is flagged; the one-way 'thread.create' never settles.
    expect([...window.unresolvedPrefixCorrelationIds].sort()).toEqual(["h0-unsettled"]);
    expect(window.materializedEntries).toBe(1);
  }).pipe(Effect.provide(TestLayer)),
);

it.live("falls back to the full journal when no checkpoint is committed (no retroactive magic)", () =>
  Effect.gen(function* () {
    const store = yield* buildStore;
    const runId = "h0-full";
    yield* Effect.all(
      [
        store.appendEntry(runId, callEntry(1, "a")),
        store.appendEntry(runId, callEntry(2, "b")),
        store.appendEntry(runId, callEntry(3, "c")),
      ].map((p) => Effect.promise(() => p)),
    );

    const window = yield* Effect.promise(() => store.readReplayWindow(runId));
    expect(window.checkpoint).toBeUndefined();
    expect(window.totalEntries).toBe(3);
    expect(window.materializedEntries).toBe(3);
    expect(seqs(window)).toEqual([1, 2, 3]);
  }).pipe(Effect.provide(TestLayer)),
);

it.live("passes the host-agnostic replay-window conformance suite against the real SQLite store", () =>
  Effect.gen(function* () {
    const store = yield* buildStore;
    const report = yield* Effect.promise(() => runReplayWindowConformance(store, "h0-conformance"));
    expect(report.scenarios).toBe(5);
    expect(report.locator).toContain("sqlite:workflow_journal/");
  }).pipe(Effect.provide(TestLayer)),
);
