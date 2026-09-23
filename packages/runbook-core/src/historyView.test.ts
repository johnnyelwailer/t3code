import { describe, expect, it } from "vite-plus/test";

import { CHECKPOINT_KIND, type CheckpointRecord } from "./checkpoint.ts";
import { selectHistoryView } from "./historyView.ts";
import { buildJournalMaps, type JournalEntry } from "./journalReader.ts";
import { toWire } from "./journalWriter.ts";

const NOW_ISO = "2026-09-01T00:00:00.000Z";

/** A journal entry as the engine writes one (call form). */
const entry = (seq: number, kind: string, result: unknown): JournalEntry => ({
  seq,
  callId: `${seq}:${kind}:ref`,
  kind,
  refId: kind === CHECKPOINT_KIND ? "checkpoint" : "ref",
  argsHash: `hash-${seq}`,
  result,
  startedAt: NOW_ISO,
  endedAt: NOW_ISO,
});

const checkpointRecord = (
  compactedThroughSeq: number,
  state: unknown,
  retainedHistory: number,
): CheckpointRecord => ({
  compactedThroughSeq,
  state,
  retainedHistory,
  at: NOW_ISO,
});

/** `iterations` loop fires, each one agent step followed by its checkpoint. */
const loopJournal = (iterations: number, retainedHistory: number, stepsPerIteration = 1) => {
  const lines = [];
  let seq = 0;
  for (let i = 0; i < iterations; i++) {
    for (let s = 0; s < stepsPerIteration; s++) lines.push(toWire(entry(++seq, "agent.step", s)));
    seq++;
    lines.push(toWire(entry(seq, "checkpoint", checkpointRecord(seq - 1, { i }, retainedHistory))));
  }
  return buildJournalMaps(lines);
};

describe("@runbook/core history(n) view", () => {
  it("returns exactly the last retained outputs, in order, for 10 checkpointed iterations", () => {
    const view = selectHistoryView(loopJournal(10, 3), 3);
    expect(view.map((h) => h.state)).toEqual([{ i: 7 }, { i: 8 }, { i: 9 }]);
    expect(view.map((h) => h.seq)).toEqual([16, 18, 20]);
    expect(view.every((h) => h.at === NOW_ISO)).toBe(true);
  });

  it("is independent of totalEntries", () => {
    const sparse = selectHistoryView(loopJournal(10, 3, 1), 3);
    const dense = selectHistoryView(loopJournal(10, 3, 7), 3);
    expect(dense.map((h) => h.state)).toEqual(sparse.map((h) => h.state));
  });

  it("clamps n above the retained count to what the ring holds", () => {
    expect(selectHistoryView(loopJournal(10, 3), 50).map((h) => h.state)).toEqual([
      { i: 7 },
      { i: 8 },
      { i: 9 },
    ]);
    expect(selectHistoryView(loopJournal(2, 3), 3).map((h) => h.state)).toEqual([
      { i: 0 },
      { i: 1 },
    ]);
  });

  it("returns the last n when n is below the retained count", () => {
    expect(selectHistoryView(loopJournal(10, 3), 1).map((h) => h.state)).toEqual([{ i: 9 }]);
    expect(selectHistoryView(loopJournal(10, 3), 0)).toEqual([]);
  });

  it("returns [] for an empty journal, a pre-checkpoint run, and zero retention", () => {
    expect(selectHistoryView(buildJournalMaps([]), 3)).toEqual([]);
    expect(selectHistoryView(buildJournalMaps([toWire(entry(1, "tool", "a"))]), 3)).toEqual([]);
    expect(selectHistoryView(loopJournal(10, 0), 3)).toEqual([]);
  });

  it("takes capacity from the ACTIVE boundary and ignores invalid checkpoint results", () => {
    const maps = buildJournalMaps([
      toWire(entry(1, "checkpoint", checkpointRecord(0, { i: 0 }, 5))),
      toWire(entry(2, "checkpoint", checkpointRecord(1, { i: 1 }, 5))),
      toWire(
        entry(3, "checkpoint", {
          compactedThroughSeq: "nope",
          state: { i: 2 },
          retainedHistory: 5,
          at: NOW_ISO,
        }),
      ),
      toWire(entry(4, "checkpoint", checkpointRecord(3, { i: 3 }, 2))),
    ]);
    expect(selectHistoryView(maps, 5).map((h) => h.state)).toEqual([{ i: 1 }, { i: 3 }]);
  });

  it("rejects a negative or non-integer n", () => {
    expect(() => selectHistoryView(loopJournal(1, 1), -1)).toThrow(/non-negative integer/);
    expect(() => selectHistoryView(loopJournal(1, 1), 1.5)).toThrow(/non-negative integer/);
  });
});
