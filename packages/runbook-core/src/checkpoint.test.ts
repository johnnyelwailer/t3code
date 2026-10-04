import { describe, expect, it } from "vite-plus/test";

import { createCheckpointPrimitives, normalizeCheckpointRetention } from "./checkpoint.ts";
import { buildJournalMaps } from "./journalReader.ts";
import { toWire, type ResolvedWireInput } from "./journalWriter.ts";
import { createDurableRuntime } from "./durableRuntime.ts";
import { PRIMITIVE_KINDS } from "./primitiveKinds.ts";
import { WorkflowError } from "./errors.ts";
import type { JournalEntry } from "./journalReader.ts";
import type { JournalSink } from "./journalStore.ts";

interface MemoryJournal {
  readonly entries: JournalEntry[];
  readonly sink: JournalSink;
}

const makeMemoryJournal = (): MemoryJournal => {
  const entries: JournalEntry[] = [];
  return {
    entries,
    sink: {
      append: (entry) => entries.push(entry),
      appendResolved: (_entry: ResolvedWireInput) => {},
      flush: async () => {},
      dispose: () => {},
    },
  };
};

const SOURCE = { now: () => 1_700_000_000_000, random: () => 0.5, uuid: () => "uuid-checkpoint" };
const LIVE_CLOCK_SOURCE = {
  now: () => {
    throw new Error("replay evaluated the live clock");
  },
  random: () => {
    throw new Error("replay evaluated host entropy");
  },
  uuid: () => {
    throw new Error("replay evaluated host uuid");
  },
};

describe("@runbook/core checkpoint primitive", () => {
  it("is a built-in primitive kind with fixed call identity", () => {
    expect(PRIMITIVE_KINDS).toContain("checkpoint");
  });

  it("records a CheckpointRecord at its allocated boundary seq", async () => {
    const journal = makeMemoryJournal();
    const runtime = createDurableRuntime({
      journal: new Map(),
      writer: journal.sink,
      source: SOURCE,
      nowIso: () => "2026-09-01T00:00:00.000Z",
    });
    const { checkpoint } = createCheckpointPrimitives({
      callPrimitive: runtime.callPrimitive,
      currentSeq: runtime.currentSeq,
      nowIso: () => "2026-09-01T00:00:00.000Z",
    });

    const state = { i: 3, total: 6, carry: "x" };
    const record = await checkpoint({ state, retention: { history: 2, superseded: "prune" } });
    expect(record).toEqual({
      compactedThroughSeq: 0,
      state,
      retainedHistory: 2,
      at: "2026-09-01T00:00:00.000Z",
      history: [{ seq: 1, state, at: "2026-09-01T00:00:00.000Z" }],
    });
    expect(journal.entries).toHaveLength(1);
    expect(journal.entries[0]).toMatchObject({ kind: "checkpoint", refId: "checkpoint", seq: 1 });
  });

  it("records the ring at commit time: previous ring + this state, capped at retention", async () => {
    const at = "2026-09-01T00:00:00.000Z";
    const runtime = createDurableRuntime({
      journal: new Map(),
      writer: makeMemoryJournal().sink,
      source: SOURCE,
      initialSeq: 10,
    });
    const { checkpoint } = createCheckpointPrimitives({
      callPrimitive: runtime.callPrimitive,
      currentSeq: runtime.currentSeq,
      nowIso: () => at,
      // A legacy boundary (no recorded ring) seeds the ring with its own entry.
      resumeFrom: { compactedThroughSeq: 9, state: { i: 0 }, retainedHistory: 2, at },
    });
    const first = await checkpoint({ state: { i: 1 }, retention: { history: 2 } });
    expect(first.history).toEqual([
      { seq: 10, state: { i: 0 }, at },
      { seq: 11, state: { i: 1 }, at },
    ]);
    const second = await checkpoint({ state: { i: 2 }, retention: { history: 2 } });
    expect(second.history?.map((h) => h.seq)).toEqual([11, 12]);
    const cleared = await checkpoint({ state: { i: 3 } });
    expect(cleared.history).toEqual([]);
  });

  it("reports compactedThroughSeq as the highest completed seq BEFORE the boundary", async () => {
    const journal = makeMemoryJournal();
    const runtime = createDurableRuntime({
      journal: new Map(),
      writer: journal.sink,
      source: SOURCE,
    });
    const { checkpoint } = createCheckpointPrimitives({
      callPrimitive: runtime.callPrimitive,
      currentSeq: runtime.currentSeq,
      nowIso: () => "2026-09-01T00:00:00.000Z",
    });
    await runtime.callPrimitive({
      kind: "tool",
      refId: "work",
      args: { n: 1 },
      exec: async () => "done-1",
    });
    await runtime.callPrimitive({
      kind: "tool",
      refId: "work",
      args: { n: 2 },
      exec: async () => "done-2",
    });
    const record = await checkpoint({ state: { i: 2 } });
    expect(record.compactedThroughSeq).toBe(2);
    expect(journal.entries.map((entry) => [entry.seq, entry.kind])).toEqual([
      [1, "tool"],
      [2, "tool"],
      [3, "checkpoint"],
    ]);
  });

  it("replays the recorded record verbatim without re-executing or reading live time", async () => {
    const first = makeMemoryJournal();
    const runtime = createDurableRuntime({
      journal: new Map(),
      writer: first.sink,
      source: SOURCE,
      nowIso: () => "2026-09-01T00:00:00.000Z",
    });
    const { checkpoint } = createCheckpointPrimitives({
      callPrimitive: runtime.callPrimitive,
      currentSeq: runtime.currentSeq,
      nowIso: () => "2026-09-01T00:00:00.000Z",
    });
    const originalRecord = await checkpoint({ state: { i: 7 } });

    // Replay against the recorded journal: exec must NOT run, the live clock must NOT be read,
    // and the record comes back byte-identical.
    const maps = buildJournalMaps(first.entries.map(toWire));
    const replay = createDurableRuntime({
      journal: maps.bySeq,
      writer: makeMemoryJournal().sink,
      source: LIVE_CLOCK_SOURCE,
      nowIso: () => {
        throw new Error("replay evaluated the live clock formatter");
      },
    });
    const replayPrimitives = createCheckpointPrimitives({
      callPrimitive: replay.callPrimitive,
      currentSeq: replay.currentSeq,
      nowIso: () => {
        throw new Error("replay evaluated the live clock formatter");
      },
    });
    const replayed = await replayPrimitives.checkpoint({ state: { i: 7 } });
    expect(replayed).toEqual(originalRecord);
    expect(replay.currentSeq()).toBe(1);
  });

  it("rejects invalid retention before journaling anything", async () => {
    const journal = makeMemoryJournal();
    const runtime = createDurableRuntime({
      journal: new Map(),
      writer: journal.sink,
      source: SOURCE,
    });
    const { checkpoint } = createCheckpointPrimitives({
      callPrimitive: runtime.callPrimitive,
      currentSeq: runtime.currentSeq,
      nowIso: () => "2026-09-01T00:00:00.000Z",
    });
    await expect(checkpoint({ state: {}, retention: { history: -1 } })).rejects.toBeInstanceOf(
      WorkflowError,
    );
    await expect(checkpoint({ state: {}, retention: { history: 1.5 } })).rejects.toBeInstanceOf(
      WorkflowError,
    );
    await expect(
      checkpoint({ state: {}, retention: { superseded: "drop" as never } }),
    ).rejects.toBeInstanceOf(WorkflowError);
    expect(journal.entries).toHaveLength(0);
    expect(normalizeCheckpointRetention(undefined)).toEqual({ history: 0, superseded: "archive" });
  });

  it("fails loud on replay drift when the compact state moved", async () => {
    const first = makeMemoryJournal();
    const runtime = createDurableRuntime({
      journal: new Map(),
      writer: first.sink,
      source: SOURCE,
    });
    const { checkpoint } = createCheckpointPrimitives({
      callPrimitive: runtime.callPrimitive,
      currentSeq: runtime.currentSeq,
      nowIso: () => "2026-09-01T00:00:00.000Z",
    });
    await checkpoint({ state: { i: 1 } });

    const maps = buildJournalMaps(first.entries.map(toWire));
    const drifted = createDurableRuntime({
      journal: maps.bySeq,
      writer: makeMemoryJournal().sink,
      source: SOURCE,
      nowIso: () => "2026-09-01T00:00:01.000Z",
    });
    const driftedPrimitives = createCheckpointPrimitives({
      callPrimitive: drifted.callPrimitive,
      currentSeq: drifted.currentSeq,
      nowIso: () => "2026-09-01T00:00:01.000Z",
    });
    await expect(driftedPrimitives.checkpoint({ state: { i: 2 } })).rejects.toThrow(
      /replay drift|args/i,
    );
  });
});
