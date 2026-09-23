import { describe, expect, it } from "vite-plus/test";

import {
  createCheckpointPrimitives,
  selectReplayWindow,
  type CheckpointRecord,
} from "./checkpoint.ts";
import { createReducePrimitives, isReduceCheckpointState, normalizeReduceRing } from "./reduce.ts";
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

const NOW_ISO = "2026-09-01T00:00:00.000Z";
const SOURCE = { now: () => 1_700_000_000_000, random: () => 0.5, uuid: () => "uuid-reduce" };
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

/** A durable runtime + the run's checkpoint primitive + reducers, as a host wires them. */
const makeReducers = (
  opts: {
    readonly journal?: ReadonlyMap<number, JournalEntry>;
    readonly initialSeq?: number;
    readonly resume?: Parameters<typeof createReducePrimitives>[0]["resume"];
    readonly source?: typeof SOURCE;
    readonly nowIso?: () => string;
  } = {},
) => {
  const journal = makeMemoryJournal();
  const nowIso = opts.nowIso ?? (() => NOW_ISO);
  const runtime = createDurableRuntime({
    journal: new Map(opts.journal ?? []),
    writer: journal.sink,
    source: opts.source ?? SOURCE,
    nowIso,
    ...(opts.initialSeq === undefined ? {} : { initialSeq: opts.initialSeq }),
  });
  const { checkpoint } = createCheckpointPrimitives({
    callPrimitive: runtime.callPrimitive,
    currentSeq: runtime.currentSeq,
    nowIso,
  });
  return { journal, runtime, ...createReducePrimitives({ checkpoint, resume: opts.resume }) };
};

const sum = (total: number | undefined, n: number): number => (total ?? 0) + n;

describe("@runbook/core reduce primitive", () => {
  it("reuses the checkpoint kind: no new primitive kind, a discriminated checkpoint state", async () => {
    expect(PRIMITIVE_KINDS).not.toContain("reduce");
    expect(PRIMITIVE_KINDS).not.toContain("accumulate");
    const { journal, accumulate } = makeReducers();

    expect(await accumulate("total", sum, 4)).toBe(4);
    expect(journal.entries).toHaveLength(1);
    expect(journal.entries[0]).toMatchObject({ kind: "checkpoint", refId: "checkpoint", seq: 1 });
    const record = journal.entries[0]?.result as { readonly state: unknown };
    expect(record.state).toEqual({
      primitive: "reduce",
      reducerId: "total",
      reducers: { total: { current: 4, ring: [] } },
    });
    expect(isReduceCheckpointState(record.state)).toBe(true);
    expect(isReduceCheckpointState({ i: 3 })).toBe(false);
  });

  it("hands the first fold `undefined`, then folds from the previous current", async () => {
    const { accumulate, reducerState } = makeReducers();
    const seen: Array<number | undefined> = [];
    const fold = (current: number | undefined, n: number) => {
      seen.push(current);
      return (current ?? 0) + n;
    };
    expect(reducerState("total")).toBeUndefined();
    await accumulate("total", fold, 1);
    await accumulate("total", fold, 2);
    expect(await accumulate("total", fold, 3)).toBe(6);
    expect(seen).toEqual([undefined, 1, 3]);
    expect(reducerState("total")).toEqual({ current: 6, ring: [] });
  });

  it("caps the ring at N and evicts the oldest observation", async () => {
    const { journal, accumulate, reducerState } = makeReducers();
    for (const n of [1, 2, 3, 4, 5]) await accumulate("total", sum, n, { retention: { ring: 3 } });
    expect(reducerState("total")).toEqual({ current: 15, ring: [3, 4, 5] });
    // Every boundary journals at most N observations — the recorded state stays bounded.
    const rings = journal.entries.map(
      (entry) =>
        (entry.result as { state: { reducers: { total: { ring: number[] } } } }).state.reducers
          .total.ring,
    );
    expect(rings).toEqual([[1], [1, 2], [1, 2, 3], [2, 3, 4], [3, 4, 5]]);
  });

  it("inherits the checkpoint retention defaults and passes history/superseded through", async () => {
    const { journal, accumulate } = makeReducers();
    await accumulate("total", sum, 1);
    await accumulate("total", sum, 2, { retention: { ring: 1, history: 2, superseded: "prune" } });
    expect(
      journal.entries.map((entry) => (entry.result as CheckpointRecord).retainedHistory),
    ).toEqual([0, 2]);

    // `ring` is the reducer's own knob: the checkpoint sees only its own retention vocabulary.
    const inputs: unknown[] = [];
    const spied = createReducePrimitives({
      checkpoint: async (input) => {
        inputs.push(input.retention);
        return { compactedThroughSeq: 0, state: input.state, retainedHistory: 0, at: NOW_ISO };
      },
    });
    await spied.accumulate("total", sum, 1);
    await spied.accumulate("total", sum, 2, { retention: { ring: 1, superseded: "prune" } });
    expect(inputs).toEqual([{}, { superseded: "prune" }]);
  });

  it("rejects an invalid ring or reducer identity before folding or journaling", async () => {
    const { journal, accumulate, reducerState } = makeReducers();
    const fold = () => {
      throw new Error("fold must not run");
    };
    await expect(accumulate("total", fold, 1, { retention: { ring: -1 } })).rejects.toBeInstanceOf(
      WorkflowError,
    );
    await expect(accumulate("total", fold, 1, { retention: { ring: 1.5 } })).rejects.toBeInstanceOf(
      WorkflowError,
    );
    await expect(accumulate("", fold, 1)).rejects.toBeInstanceOf(WorkflowError);
    expect(journal.entries).toHaveLength(0);
    expect(reducerState("total")).toBeUndefined();
    expect(normalizeReduceRing(undefined)).toBe(0);
  });

  it("carries every reducer in each boundary so a resume restores all of them", async () => {
    const { journal, accumulate } = makeReducers();
    await accumulate("total", sum, 5);
    await accumulate("max", (m: number | undefined, n: number) => Math.max(m ?? n, n), 9, {
      retention: { ring: 2 },
    });
    const window = selectReplayWindow(buildJournalMaps(journal.entries.map(toWire)));
    expect(window.checkpoint?.record.state).toEqual({
      primitive: "reduce",
      reducerId: "max",
      reducers: { total: { current: 5, ring: [] }, max: { current: 9, ring: [9] } },
    });

    // The resumed drive seeds BOTH reducers, not just the one that folded last.
    const resumed = makeReducers({
      journal: window.entries.bySeq,
      initialSeq: window.checkpoint?.seq ?? 0,
      resume: window.checkpoint?.record,
    });
    expect(resumed.reducerState("total")).toEqual({ current: 5, ring: [] });
    expect(await resumed.accumulate("total", sum, 1)).toBe(6);
  });

  it("replays the recorded boundaries verbatim without reading live time", async () => {
    const first = makeReducers();
    for (const n of [2, 4, 6]) await first.accumulate("total", sum, n, { retention: { ring: 2 } });

    const replay = makeReducers({
      journal: buildJournalMaps(first.journal.entries.map(toWire)).bySeq,
      source: LIVE_CLOCK_SOURCE,
      nowIso: () => {
        throw new Error("replay evaluated the live clock formatter");
      },
    });
    for (const n of [2, 4, 6]) await replay.accumulate("total", sum, n, { retention: { ring: 2 } });
    expect(replay.reducerState("total")).toEqual({ current: 12, ring: [4, 6] });
    expect(replay.journal.entries).toHaveLength(0);
    expect(replay.runtime.currentSeq()).toBe(3);
  });

  it("fails loud on replay drift when the fold is not deterministic", async () => {
    const first = makeReducers();
    await first.accumulate("total", sum, 1);

    const drifted = makeReducers({
      journal: buildJournalMaps(first.journal.entries.map(toWire)).bySeq,
    });
    await expect(
      drifted.accumulate("total", (t: number | undefined, n: number) => (t ?? 0) + n * 2, 1),
    ).rejects.toThrow(/replay drift|args/i);
  });

  it("restarts reducers across a plain checkpoint boundary (author state only)", async () => {
    const resumed = makeReducers({
      resume: { compactedThroughSeq: 0, state: { i: 3 }, retainedHistory: 0, at: NOW_ISO },
    });
    expect(resumed.reducerState("total")).toBeUndefined();
  });

  it("rolls the reducer back when the boundary commit fails", async () => {
    let refuse = false;
    const { accumulate, reducerState } = createReducePrimitives({
      checkpoint: async (input) => {
        if (refuse) throw new WorkflowError("commit refused");
        return { compactedThroughSeq: 0, state: input.state, retainedHistory: 0, at: NOW_ISO };
      },
    });
    await accumulate("total", sum, 1);
    refuse = true;
    await expect(accumulate("total", sum, 2)).rejects.toThrow("commit refused");
    await expect(accumulate("fresh", sum, 2)).rejects.toThrow("commit refused");
    expect(reducerState("total")).toEqual({ current: 1, ring: [] });
    expect(reducerState("fresh")).toBeUndefined();
  });
});
