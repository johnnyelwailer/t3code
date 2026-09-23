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
  const reduce = createReducePrimitives({
    checkpoint,
    resume: opts.resume,
    isBlackBoxed: runtime.isBlackBoxed,
  });
  return { journal, runtime, ...reduce };
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
      isBlackBoxed: () => false,
      checkpoint: async (input) => {
        inputs.push(input.retention);
        return { compactedThroughSeq: 0, state: input.state, retainedHistory: 0, at: NOW_ISO };
      },
    });
    await spied.accumulate("total", sum, 1);
    await spied.accumulate("total", sum, 2, { retention: { ring: 1, superseded: "prune" } });
    expect(inputs).toEqual([{}, { superseded: "prune" }]);
  });

  it("rejects an invalid ring, reducer identity, or undefined fold result before journaling", async () => {
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
    // A fold result of `undefined` could not be restored on resume: refused before journaling.
    await expect(accumulate("total", () => undefined, 1)).rejects.toThrow(/returned undefined/);
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

  it("refuses a plain checkpoint() once a reducer is active (it would drop reducer state)", async () => {
    const { journal, accumulate, checkpoint } = makeReducers();
    // Before any fold a plain boundary is fine: no reducer can be lost by resuming from it.
    await checkpoint({ state: { i: 0 } });
    await accumulate("total", sum, 5);
    await expect(checkpoint({ state: { i: 1 } })).rejects.toThrow(/cannot follow accumulate/);
    expect(journal.entries.map((entry) => entry.seq)).toEqual([1, 2]);

    // A resume from a plain boundary therefore never had an active reducer to restore.
    const resumed = makeReducers({
      resume: { compactedThroughSeq: 0, state: { i: 3 }, retainedHistory: 0, at: NOW_ISO },
    });
    expect(resumed.reducerState("total")).toBeUndefined();
  });

  it("refuses a fold inside a black-boxed composition branch (it could not be replayed)", async () => {
    const { journal, runtime, accumulate, reducerState } = makeReducers();
    await expect(runtime.runBlackBoxed(() => accumulate("total", sum, 1))).rejects.toThrow(
      /inside a parallel\/pipeline branch/,
    );
    expect(journal.entries).toHaveLength(0);
    expect(reducerState("total")).toBeUndefined();
  });

  it("serializes concurrent folds and never records an uncommitted fold in a boundary", async () => {
    const committed: unknown[] = [];
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => (releaseFirst = resolve));
    let calls = 0;
    const { accumulate, reducerState } = createReducePrimitives({
      isBlackBoxed: () => false,
      checkpoint: async (input) => {
        calls += 1;
        if (calls === 1) {
          await firstHeld;
          throw new WorkflowError("host crashed mid-commit");
        }
        committed.push(input.state);
        return { compactedThroughSeq: 0, state: input.state, retainedHistory: 0, at: NOW_ISO };
      },
    });
    const b = accumulate("b", sum, 1);
    const a = accumulate("a", sum, 1);
    // `a` waits for `b`'s commit instead of snapshotting `b`'s in-flight fold.
    await Promise.resolve();
    expect(calls).toBe(1);
    releaseFirst();
    await expect(b).rejects.toThrow("mid-commit");
    expect(await a).toBe(1);
    expect(committed).toEqual([
      { primitive: "reduce", reducerId: "a", reducers: { a: { current: 1, ring: [] } } },
    ]);
    expect(reducerState("b")).toBeUndefined();
  });

  it("leaves no trace when a fold mutates its input and throws", async () => {
    const { journal, accumulate, reducerState } = makeReducers();
    await accumulate("count", (c: { n: number } | undefined) => ({ n: (c?.n ?? 0) + 1 }), null);
    await expect(
      accumulate(
        "count",
        (c: { n: number } | undefined) => {
          if (c !== undefined) c.n += 100;
          throw new Error("fold failed");
        },
        null,
      ),
    ).rejects.toThrow("fold failed");
    expect(reducerState("count")).toEqual({ current: { n: 1 }, ring: [] });
    // Neither can a caller mutate the recorded snapshot through what it was handed.
    const handed = reducerState<{ n: number }>("count");
    if (handed !== undefined) (handed.current as { n: number }).n = 42;
    expect(
      await accumulate("count", (c: { n: number } | undefined) => ({ n: (c?.n ?? 0) + 1 }), null),
    ).toEqual({ n: 2 });
    expect(journal.entries).toHaveLength(2);
  });

  it("allocates an idle fold's boundary seq at the call site, like a direct checkpoint()", async () => {
    const { journal, runtime, accumulate } = makeReducers();
    const folded = accumulate("total", sum, 1);
    await runtime.callPrimitive({ kind: "tool", refId: "next", args: {}, exec: async () => 1 });
    await folded;
    expect(journal.entries.map((entry) => [entry.seq, entry.kind])).toEqual([
      [1, "checkpoint"],
      [2, "tool"],
    ]);
  });

  it("re-checks for a composition branch when a queued fold finally commits", async () => {
    let blackBoxed = false;
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => (releaseFirst = resolve));
    const commits: unknown[] = [];
    const { accumulate } = createReducePrimitives({
      isBlackBoxed: () => blackBoxed,
      checkpoint: async (input) => {
        if (commits.push(input.state) === 1) await firstHeld;
        return { compactedThroughSeq: 0, state: input.state, retainedHistory: 0, at: NOW_ISO };
      },
    });
    const first = accumulate("total", sum, 1);
    const queued = accumulate("total", sum, 2);
    // A composition branch starts before the queued fold gets its turn.
    blackBoxed = true;
    releaseFirst();
    expect(await first).toBe(1);
    await expect(queued).rejects.toThrow(/inside a parallel\/pipeline branch/);
    expect(commits).toHaveLength(1);
  });

  it("keeps in memory exactly what replay restores (strict canonical JSON)", async () => {
    const { journal, accumulate, reducerState } = makeReducers();
    await expect(accumulate("seen", () => new Map([["a", 1]]), null)).rejects.toThrow(
      /not canonical JSON/,
    );
    expect(journal.entries).toHaveLength(0);
    expect(reducerState("seen")).toBeUndefined();
    // A nested `undefined` is dropped on the journal, so it is refused rather than kept in memory.
    await expect(accumulate("shape", () => ({ a: undefined }), null)).rejects.toThrow(
      /not canonical JSON/,
    );
  });

  it("leaves the reducer untouched when the boundary commit fails", async () => {
    let refuse = false;
    const { accumulate, reducerState } = createReducePrimitives({
      isBlackBoxed: () => false,
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
