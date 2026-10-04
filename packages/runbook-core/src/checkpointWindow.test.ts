import { describe, expect, it } from "vite-plus/test";

import {
  CHECKPOINT_KIND,
  createCheckpointPrimitives,
  isCheckpointRecord,
  selectReplayWindow,
  type CheckpointRecord,
} from "./checkpoint.ts";
import { buildJournalMaps } from "./journalReader.ts";
import { toWire, type ResolvedWireInput } from "./journalWriter.ts";
import { createDurableRuntime } from "./durableRuntime.ts";
import type { JournalEntry } from "./journalReader.ts";
import type { JournalSink } from "./journalStore.ts";

interface MemoryJournal {
  readonly entries: JournalEntry[];
  readonly resolved: ResolvedWireInput[];
  readonly sink: JournalSink;
}

const makeMemoryJournal = (): MemoryJournal => {
  const entries: JournalEntry[] = [];
  const resolved: ResolvedWireInput[] = [];
  return {
    entries,
    resolved,
    sink: {
      append: (entry) => entries.push(entry),
      appendResolved: (entry) => resolved.push(entry),
      flush: async () => {},
      dispose: () => {},
    },
  };
};

const SOURCE = { now: () => 1_700_000_000_000, random: () => 0.5, uuid: () => "uuid-window" };
const NOW_ISO = "2026-09-01T00:00:00.000Z";

/** A journal entry as the engine writes one (call form). */
const entry = (
  seq: number,
  kind: string,
  result: unknown,
  extra: Partial<JournalEntry> = {},
): JournalEntry => ({
  seq,
  callId: `${seq}:${kind}:ref`,
  kind,
  refId: kind === CHECKPOINT_KIND ? "checkpoint" : "ref",
  argsHash: `hash-${seq}`,
  result,
  startedAt: NOW_ISO,
  endedAt: NOW_ISO,
  ...extra,
});

const checkpointRecord = (compactedThroughSeq: number, state: unknown): CheckpointRecord => ({
  compactedThroughSeq,
  state,
  retainedHistory: 0,
  at: NOW_ISO,
});

describe("@runbook/core checkpoint-aware replay window", () => {
  it("is the full journal when no checkpoint is committed (no retroactive magic)", () => {
    const maps = buildJournalMaps([
      toWire(entry(1, "tool", "a")),
      toWire(entry(2, "tool", "b")),
      toWire(entry(3, "tool", "c")),
    ]);
    const window = selectReplayWindow(maps);
    expect(window.checkpoint).toBeUndefined();
    expect(window.totalEntries).toBe(3);
    expect(window.materializedEntries).toBe(3);
    expect([...window.entries.bySeq.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(window.unresolvedPrefixCorrelationIds).toEqual([]);
  });

  it("materializes only the suffix strictly after the latest valid checkpoint", () => {
    const maps = buildJournalMaps([
      toWire(entry(1, "tool", "a")),
      toWire(entry(2, "checkpoint", checkpointRecord(1, { i: 1 }))),
      toWire(entry(3, "tool", "b")),
      toWire(entry(4, "tool", "c")),
      toWire(entry(5, "checkpoint", checkpointRecord(4, { i: 3 }))),
      toWire(entry(6, "tool", "d")),
    ]);
    const window = selectReplayWindow(maps);
    expect(window.checkpoint?.seq).toBe(5);
    expect(window.checkpoint?.record.state).toEqual({ i: 3 });
    expect(window.totalEntries).toBe(6);
    expect(window.materializedEntries).toBe(1);
    expect([...window.entries.bySeq.keys()]).toEqual([6]);
    // The boundary itself is what the compact state replaces — never materialized.
    expect(window.entries.bySeq.has(5)).toBe(false);
  });

  it("ignores structurally invalid checkpoint results and falls back to the prior valid one", () => {
    const maps = buildJournalMaps([
      toWire(entry(1, "tool", "a")),
      toWire(entry(2, "checkpoint", checkpointRecord(1, { i: 1 }))),
      toWire(entry(3, "tool", "b")),
      toWire(
        entry(
          4,
          "checkpoint",
          // Corrupt shape: not a CheckpointRecord.
          { compactedThroughSeq: "nope", state: { i: 2 }, retainedHistory: 0, at: NOW_ISO },
        ),
      ),
      toWire(entry(5, "tool", "c")),
    ]);
    expect(isCheckpointRecord(maps.bySeq.get(4)?.result)).toBe(false);
    const window = selectReplayWindow(maps);
    expect(window.checkpoint?.seq).toBe(2);
    // The retained suffix spans everything after seq 2 — the corrupt boundary is not authority.
    expect(window.materializedEntries).toBe(3);
    expect([...window.entries.bySeq.keys()].sort((a, b) => a - b)).toEqual([3, 4, 5]);
  });

  it("keeps the full correlation map and flags unresolved RESOLVABLE asks in the collapsed prefix", () => {
    const maps = buildJournalMaps([
      toWire(
        entry(1, "thread.turn", undefined, {
          phase: "sent",
          correlationId: "run-1:1",
          startedAt: NOW_ISO,
          endedAt: NOW_ISO,
        }),
      ),
      toWire(
        entry(2, "thread.create", undefined, {
          phase: "sent",
          correlationId: "run-1:2",
          startedAt: NOW_ISO,
          endedAt: NOW_ISO,
        }),
      ),
      toWire(entry(3, "tool", "done")),
      toWire(entry(4, "checkpoint", checkpointRecord(3, { i: 1 }))),
      toWire(entry(5, "tool", "next")),
    ]);
    // No `resolved` lines at all: the turn is unsettled, the one-way create is by design never settled.
    const window = selectReplayWindow(maps);
    expect(window.checkpoint?.seq).toBe(4);
    expect(window.unresolvedPrefixCorrelationIds).toEqual(["run-1:1"]);
    expect(window.materializedEntries).toBe(1);
  });

  it("property: checkpointing every N iterations bounds materialization independent of K", () => {
    const materialize = (iterations: number) => {
      const wires = [];
      for (let i = 0; i < iterations; i++) {
        wires.push(toWire(entry(2 * i + 1, "tool", `result-${i}`)));
        wires.push(
          toWire(
            entry(2 * i + 2, "checkpoint", checkpointRecord(2 * i + 1, { i: i + 1, total: i + 1 })),
          ),
        );
      }
      const window = selectReplayWindow(buildJournalMaps(wires));
      return {
        materialized: window.materializedEntries,
        total: window.totalEntries,
        checkpointSeq: window.checkpoint?.seq,
      };
    };

    // Same interval ⇒ same materialized working set, whatever the lifetime length.
    const small = materialize(50);
    const large = materialize(20_000);
    expect(small.materialized).toBe(0);
    expect(large.materialized).toBe(0);
    expect(large.total).toBe(40_000);
    expect(large.checkpointSeq).toBe(40_000);

    // Crash mid-iteration (work journaled, checkpoint not yet): suffix is exactly one entry.
    const crashedWires: ReturnType<typeof toWire>[] = [];
    for (let i = 0; i < 500; i++) {
      crashedWires.push(toWire(entry(2 * i + 1, "tool", `result-${i}`)));
      crashedWires.push(
        toWire(entry(2 * i + 2, "checkpoint", checkpointRecord(2 * i + 1, { i: i + 1 }))),
      );
    }
    crashedWires.push(toWire(entry(1001, "tool", "in-flight")));
    const crashed = selectReplayWindow(buildJournalMaps(crashedWires));
    expect(crashed.materializedEntries).toBe(1);
    expect(crashed.totalEntries).toBe(1001);
  });
});

/**
 * Crash/resume simulation on the real durable runtime:
 * a loop body that calls an (instrumented) agent step + a checkpoint each iteration,
 * "crashes" part-way, resumes through the replay window with the runtime's seq counter
 * seeded at the boundary — and must NOT re-fire any journaled agent step.
 */
describe("@runbook/core checkpoint crash-resume (durable runtime)", () => {
  const runIterations = async (opts: {
    readonly journal: MemoryJournal;
    readonly replayJournal?: ReadonlyMap<number, JournalEntry> | undefined;
    readonly resumeFrom?: number | undefined;
    readonly restoredState?: { readonly i: number; readonly total: number } | undefined;
    readonly k: number;
    readonly promptFor?: (i: number) => string;
  }): Promise<{ state: { i: number; total: number }; liveAgentExecs: number }> => {
    const runtime = createDurableRuntime({
      journal: opts.replayJournal ?? new Map(),
      writer: opts.journal.sink,
      source: SOURCE,
      nowIso: () => NOW_ISO,
      ...(opts.resumeFrom === undefined ? {} : { initialSeq: opts.resumeFrom }),
    });
    const { checkpoint } = createCheckpointPrimitives({
      callPrimitive: runtime.callPrimitive,
      currentSeq: runtime.currentSeq,
      nowIso: () => NOW_ISO,
    });
    let liveAgentExecs = 0;
    const promptFor = opts.promptFor ?? ((i: number) => `agent-step-${i}`);
    // The body: resume from the compact state when provided, otherwise start fresh.
    let state = opts.restoredState ?? { i: 0, total: 0 };
    for (let i = state.i; i < opts.k; i++) {
      const result: number = await runtime.callPrimitive({
        kind: "agent.step",
        refId: "agent",
        args: { prompt: promptFor(i) },
        exec: async () => {
          liveAgentExecs += 1;
          return i + 1;
        },
      });
      state = { i: i + 1, total: state.total + result };
      await checkpoint({ state });
    }
    return { state, liveAgentExecs };
  };

  it("resumes from the checkpoint: no re-fire of journaled agent steps, bounded working set", async () => {
    const K = 40;
    const CRASH_AT = 25; // iterations 0..24 completed + journaled; the crash hits before i=25.

    const first = makeMemoryJournal();
    const firstRun = await runIterations({ journal: first, k: CRASH_AT });
    expect(firstRun.state).toEqual({ i: CRASH_AT, total: sum(1, CRASH_AT) });
    expect(firstRun.liveAgentExecs).toBe(CRASH_AT);
    expect(first.entries).toHaveLength(2 * CRASH_AT);

    // The host reads the bounded window and re-drives with the counter seeded at the boundary.
    const maps = buildJournalMaps(first.entries.map(toWire));
    const window = selectReplayWindow(maps);
    expect(window.checkpoint?.seq).toBe(2 * CRASH_AT);
    expect(window.materializedEntries).toBe(0);
    expect(window.totalEntries).toBe(2 * CRASH_AT);
    const compact = window.checkpoint?.record.state as { i: number; total: number };

    const resumed = makeMemoryJournal();
    const secondRun = await runIterations({
      journal: resumed,
      replayJournal: window.entries.bySeq,
      resumeFrom: window.checkpoint?.seq,
      restoredState: compact,
      k: K,
    });
    // (a) continues from the checkpoint, not the top: only the remaining iterations ran.
    expect(secondRun.liveAgentExecs).toBe(K - CRASH_AT);
    // The appended entries continue at the ORIGINAL positions — no renumbering, no collisions.
    expect(resumed.entries.map((e) => e.seq)).toEqual(
      Array.from({ length: 2 * (K - CRASH_AT) }, (_, n) => 2 * CRASH_AT + 1 + n),
    );
    // (b) deterministic: the resume's outcome is the exact continuation of the original.
    expect(secondRun.state).toEqual({ i: K, total: sum(1, K) });
    // (c) the replayed working set stayed bounded: the resume run materialized 0 prefix entries
    // and journaled exactly the remaining iterations.
    expect(window.entries.bySeq.size).toBe(0);
  });

  it("resumes into an in-flight iteration: the recorded agent step replays instead of re-firing", async () => {
    const K = 30;
    const journal = makeMemoryJournal();
    // Run 25 iterations, then journaled the in-flight agent of iteration 25 without its checkpoint
    // (crash between the agent call and the checkpoint commit). The counter continues AT 50, so
    // the in-flight agent lands at seq 51 — strictly after the boundary checkpoint at seq 50.
    const firstRun = await runIterations({ journal, k: 25 });
    const firstRuntime = createDurableRuntime({
      journal: new Map(),
      writer: journal.sink,
      source: SOURCE,
      nowIso: () => NOW_ISO,
      initialSeq: 50,
    });
    await firstRuntime.callPrimitive({
      kind: "agent.step",
      refId: "agent",
      args: { prompt: "agent-step-25" },
      exec: async () => 26,
    });

    const maps = buildJournalMaps(journal.entries.map(toWire));
    const window = selectReplayWindow(maps);
    expect(window.checkpoint?.seq).toBe(50);
    expect(window.materializedEntries).toBe(1); // only the in-flight agent step

    const resumed = makeMemoryJournal();
    let replayHits = 0;
    const second = createDurableRuntime({
      journal: window.entries.bySeq,
      writer: resumed.sink,
      source: SOURCE,
      nowIso: () => NOW_ISO,
      initialSeq: window.checkpoint?.seq,
    });
    let liveAgentExecs = 0;
    let state = window.checkpoint?.record.state as { i: number; total: number };
    for (let i = state.i; i < K; i++) {
      const result: number = await second.callPrimitive({
        kind: "agent.step",
        refId: "agent",
        args: { prompt: `agent-step-${i}` },
        exec: async () => {
          liveAgentExecs += 1;
          return i + 1;
        },
        decodeRecorded: () => {
          replayHits += 1;
          return 26;
        },
      });
      state = { i: i + 1, total: state.total + result };
      const { checkpoint } = createCheckpointPrimitives({
        callPrimitive: second.callPrimitive,
        currentSeq: second.currentSeq,
        nowIso: () => NOW_ISO,
      });
      await checkpoint({ state });
    }
    // The journaled agent step of the in-flight iteration replayed — it did NOT re-fire.
    expect(replayHits).toBe(1);
    expect(liveAgentExecs).toBe(K - 25 - 1);
    expect(state).toEqual({ i: K, total: sum(1, K) });
  });

  it("fails loud on args drift across the boundary instead of silently continuing", async () => {
    const journal = makeMemoryJournal();
    await runIterations({ journal, k: 5 });
    // In-flight: the agent of iteration 5 journaled (at seq 11), its checkpoint never committed.
    const inFlight = createDurableRuntime({
      journal: new Map(),
      writer: journal.sink,
      source: SOURCE,
      nowIso: () => NOW_ISO,
      initialSeq: 10,
    });
    await inFlight.callPrimitive({
      kind: "agent.step",
      refId: "agent",
      args: { prompt: "agent-step-5" },
      exec: async () => 6,
    });

    const maps = buildJournalMaps(journal.entries.map(toWire));
    const window = selectReplayWindow(maps);

    const resumed = makeMemoryJournal();
    await expect(
      runIterations({
        journal: resumed,
        replayJournal: window.entries.bySeq,
        resumeFrom: window.checkpoint?.seq,
        restoredState: window.checkpoint?.record.state as { i: number; total: number },
        k: 6,
        // The re-driven body prompts the in-flight step differently: the recorded argsHash no
        // longer lines up, so the replay must fail loud instead of continuing on drifted args.
        promptFor: (i) => `agent-step-${i}-CHANGED`,
      }),
    ).rejects.toThrow(/replay drift/i);
  });
});

function sum(from: number, through: number): number {
  let total = 0;
  for (let n = from; n <= through; n++) total += n;
  return total;
}
