import { describe, expect, it } from "vite-plus/test";

import {
  CHECKPOINT_KIND,
  createCheckpointPrimitives,
  selectReplayWindow,
  type CheckpointPrimitives,
  type CheckpointRecord,
} from "./checkpoint.ts";
import { createDurableRuntime } from "./durableRuntime.ts";
import { WatermarkScopeError, WorkflowError } from "./errors.ts";
import { buildJournalMaps, type JournalEntry, type JournalMaps } from "./journalReader.ts";
import { toWire } from "./journalWriter.ts";
import type { JournalSink } from "./journalStore.ts";
import {
  createWatermarkPrimitives,
  isWatermarkState,
  type WatermarkPrimitives,
  type WatermarkState,
} from "./watermark.ts";

const NOW_ISO = "2026-09-01T00:00:00.000Z";
const CRASH = Symbol("simulated host crash");
const LIVE_CLOCK_FORBIDDEN = {
  now: () => {
    throw new Error("replay evaluated the live clock");
  },
  random: () => 0.5,
  uuid: () => "uuid-watermark",
};

/** A ticking host clock: every live `now()` is a new instant, so replay must read the journal. */
const tickingSource = () => {
  let t = 1_700_000_000_000;
  return { now: () => (t += 1_000), random: () => 0.5, uuid: () => "uuid-watermark" };
};

interface Drive {
  readonly entries: JournalEntry[];
  readonly primitives: WatermarkPrimitives;
  readonly maps: () => JournalMaps;
}

/**
 * One drive of a body: a durable runtime over `journal` (empty = fresh), the real checkpoint
 * primitive, and the watermark primitives seeded from `resume` — the same wiring a host does.
 */
const drive = (opts: {
  readonly journal?: JournalMaps;
  readonly resume?: { readonly fromSeq: number; readonly checkpoint: CheckpointRecord };
  readonly source?: { now: () => number; random: () => number; uuid: () => string };
  readonly wrapCheckpoint?: (
    real: CheckpointPrimitives["checkpoint"],
  ) => CheckpointPrimitives["checkpoint"];
  readonly isAllowed?: (key: string) => boolean;
}): Drive => {
  const entries: JournalEntry[] = [];
  const sink: JournalSink = {
    append: (entry) => entries.push(entry),
    appendResolved: () => {},
    flush: async () => {},
    dispose: () => {},
  };
  const runtime = createDurableRuntime({
    journal: opts.journal?.bySeq ?? new Map(),
    writer: sink,
    source: opts.source ?? tickingSource(),
    nowIso: () => NOW_ISO,
    ...(opts.resume === undefined ? {} : { initialSeq: opts.resume.fromSeq }),
  });
  const real = createCheckpointPrimitives({
    callPrimitive: runtime.callPrimitive,
    currentSeq: runtime.currentSeq,
    nowIso: () => NOW_ISO,
  }).checkpoint;
  const primitives = createWatermarkPrimitives({
    checkpoint: opts.wrapCheckpoint === undefined ? real : opts.wrapCheckpoint(real),
    resume: opts.resume?.checkpoint,
    now: runtime.now,
    ...(opts.isAllowed === undefined
      ? {}
      : {
          isAllowed: opts.isAllowed,
          denied: (key: string) => new WorkflowError(`denied ${key}`),
        }),
  });
  return { entries, primitives, maps: () => buildJournalMaps(entries.map((e) => toWire(e))) };
};

/** The checkpoint-window resume a host builds from the durable journal. */
const windowResume = (maps: JournalMaps) => {
  const window = selectReplayWindow(maps);
  if (window.checkpoint === undefined) throw new Error("expected a committed boundary");
  return {
    journal: window.entries,
    resume: { fromSeq: window.checkpoint.seq, checkpoint: window.checkpoint.record },
  };
};

const checkpoints = (entries: ReadonlyArray<JournalEntry>) =>
  entries.filter((entry) => entry.kind === CHECKPOINT_KIND);

describe("@runbook/core watermark primitive", () => {
  it("journals each advance as an ordinary checkpoint whose state is the watermark envelope", async () => {
    const first = drive({});
    const cursor = first.primitives.watermark<number>("src.a", { initial: 0 });
    expect(cursor.current()).toBe(0);
    await cursor.advance(10);
    expect(cursor.current()).toBe(10);

    // One journaled clock read (observation time) + one checkpoint boundary — no new kind.
    expect(first.entries.map((e) => e.kind)).toEqual(["now", CHECKPOINT_KIND]);
    const record = first.entries[1]?.result as CheckpointRecord<WatermarkState<number>>;
    expect(record.state).toEqual({
      v: 1,
      primitive: "watermark",
      source: "src.a",
      cursor: 10,
      observedAt: first.entries[0]?.result,
      sources: { "src.a": { cursor: 10, observedAt: first.entries[0]?.result, diagnostics: [] } },
    });
    expect(isWatermarkState(record.state)).toBe(true);
  });

  it("(a) replay determinism: a resume from the truncated checkpoint suffix reads the identical cursor", async () => {
    const first = drive({});
    const a = first.primitives.watermark<{ readonly offset: number }>("src.a");
    const b = first.primitives.watermark<string>("src.b");
    await a.advance({ offset: 10 });
    await b.advance("rev-1");
    await a.advance({ offset: 20 });
    await a.advance({ offset: 30 });
    const durable = first.maps();

    // Truncate to the checkpoint suffix: the window holds NOTHING after the last boundary.
    const { journal, resume } = windowResume(durable);
    expect(journal.bySeq.size).toBe(0);
    const resumed = drive({ journal, resume, source: LIVE_CLOCK_FORBIDDEN });
    // Both sources survive: the latest boundary carries every source's cursor, not only its own.
    expect(resumed.primitives.watermark("src.a").current()).toEqual({ offset: 30 });
    expect(resumed.primitives.watermark("src.b").current()).toBe("rev-1");
    expect(resumed.entries).toHaveLength(0);

    // A full replay of the same body over the whole journal rebuilds the identical envelopes:
    // every advance replays (argsHash matches), nothing is re-journaled, the live clock is unused.
    const replay = drive({ journal: durable, source: LIVE_CLOCK_FORBIDDEN });
    const ra = replay.primitives.watermark<{ readonly offset: number }>("src.a");
    const rb = replay.primitives.watermark<string>("src.b");
    await ra.advance({ offset: 10 });
    await rb.advance("rev-1");
    await ra.advance({ offset: 20 });
    await ra.advance({ offset: 30 });
    expect(replay.entries).toHaveLength(0);
    expect(ra.current()).toEqual({ offset: 30 });
  });

  it("(a) a re-driven body whose cursor moved fails the ordinary replay-drift check", async () => {
    const first = drive({});
    await first.primitives.watermark<number>("src.a").advance(10);
    const replay = drive({ journal: first.maps(), source: LIVE_CLOCK_FORBIDDEN });
    await expect(replay.primitives.watermark<number>("src.a").advance(11)).rejects.toThrow(
      /drift|argsHash|does not match/i,
    );
  });

  it("(b) retention: the diagnostics ring keeps the last N superseded cursors, oldest evicted first", async () => {
    const first = drive({});
    const cursor = first.primitives.watermark<number>("src.a", { retention: { history: 2 } });
    for (const next of [1, 2, 3, 4, 5]) await cursor.advance(next);

    const last = checkpoints(first.entries).at(-1)?.result as CheckpointRecord<WatermarkState>;
    const source = last.state.sources["src.a"];
    expect(source?.cursor).toBe(5);
    expect(source?.diagnostics.map((point) => point.cursor)).toEqual([3, 4]);
    // Observation times stay attached to their cursors and ascend (journaled clock).
    const times = source?.diagnostics.map((point) => point.observedAt) ?? [];
    expect(times[0]).toBeLessThan(times[1] ?? 0);
    expect(times[1]).toBeLessThan(source?.observedAt ?? 0);
    // The ring size IS the checkpoint's retention.history — no second retention vocabulary.
    expect(last.retainedHistory).toBe(2);

    // The ring is restored on resume and keeps evicting from there.
    const { journal, resume } = windowResume(first.maps());
    const resumed = drive({ journal, resume });
    await resumed.primitives.watermark<number>("src.a", { retention: { history: 2 } }).advance(6);
    const after = checkpoints(resumed.entries).at(-1)?.result as CheckpointRecord<WatermarkState>;
    expect(after.state.sources["src.a"]?.diagnostics.map((point) => point.cursor)).toEqual([4, 5]);
  });

  it("(b) retention defaults to checkpoint's own default: no diagnostics are kept", async () => {
    const first = drive({});
    const cursor = first.primitives.watermark<number>("src.a");
    await cursor.advance(1);
    await cursor.advance(2);
    const last = checkpoints(first.entries).at(-1)?.result as CheckpointRecord<WatermarkState>;
    expect(last.state.sources["src.a"]?.diagnostics).toEqual([]);
    expect(last.retainedHistory).toBe(0);
  });

  it("(c) crash after an advance, before the next observation: resume reads strictly after that cursor", async () => {
    const first = drive({});
    const cursor = first.primitives.watermark<number>("src.a", { initial: 0 });
    await cursor.advance(10);
    // The host dies here — before the body observes anything past cursor 10.
    const { journal, resume } = windowResume(first.maps());

    const resumed = drive({ journal, resume });
    const again = resumed.primitives.watermark<number>("src.a", { initial: 0 });
    expect(again.current()).toBe(10);
    await again.advance(11);
    expect(checkpoints([...first.entries, ...resumed.entries])).toHaveLength(2);
  });

  it("(c) crash inside an advance, before its boundary commits: resume keeps the prior cursor and re-advances once", async () => {
    let checkpointCalls = 0;
    const first = drive({
      wrapCheckpoint: (real) => async (input) => {
        checkpointCalls += 1;
        if (checkpointCalls === 2) throw CRASH;
        return await real(input);
      },
    });
    const cursor = first.primitives.watermark<number>("src.a");
    await cursor.advance(10);
    await expect(cursor.advance(20)).rejects.toBe(CRASH);
    // Not durable → not current: the in-memory cursor rolls back.
    expect(cursor.current()).toBe(10);
    // Journal: now, checkpoint(10), now — the second boundary never committed.
    expect(first.entries.map((e) => e.kind)).toEqual(["now", CHECKPOINT_KIND, "now"]);

    const { journal, resume } = windowResume(first.maps());
    // The suffix is exactly the orphaned clock read; it replays, so the live clock is not read.
    expect([...journal.bySeq.values()].map((e) => e.kind)).toEqual(["now"]);
    const resumed = drive({ journal, resume, source: LIVE_CLOCK_FORBIDDEN });
    const again = resumed.primitives.watermark<number>("src.a");
    expect(again.current()).toBe(10);
    await again.advance(20);
    expect(resumed.entries.map((e) => e.kind)).toEqual([CHECKPOINT_KIND]);
    expect(again.current()).toBe(20);
  });

  it("owns the run's boundary: a raw checkpoint after watermark() is refused before journaling", async () => {
    const first = drive({});
    await first.primitives.watermark<number>("src.a").advance(1);
    const before = first.entries.length;
    await expect(first.primitives.checkpoint({ state: { i: 1 } })).rejects.toBeInstanceOf(
      WatermarkScopeError,
    );
    expect(first.entries).toHaveLength(before);
  });

  it("refuses watermark() after a raw checkpoint, and on a resume whose boundary is a raw checkpoint", async () => {
    const first = drive({});
    await first.primitives.checkpoint({ state: { i: 1 } });
    expect(() => first.primitives.watermark("src.a")).toThrow(WatermarkScopeError);

    const { journal, resume } = windowResume(first.maps());
    const resumed = drive({ journal, resume });
    const error = (() => {
      try {
        resumed.primitives.watermark("src.a");
      } catch (thrown) {
        return thrown;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(WatermarkScopeError);
    expect((error as WatermarkScopeError).owner).toBe("checkpoint");
  });

  it("refuses a raw checkpoint on a resume whose boundary is a watermark envelope", async () => {
    const first = drive({});
    await first.primitives.watermark<number>("src.a").advance(1);
    const { journal, resume } = windowResume(first.maps());
    const resumed = drive({ journal, resume });
    await expect(resumed.primitives.checkpoint({ state: {} })).rejects.toBeInstanceOf(
      WatermarkScopeError,
    );
  });

  it("applies the host's capability policy at the watermark() call, before journaling", () => {
    const first = drive({ isAllowed: (key) => key === "src.allowed" });
    expect(() => first.primitives.watermark("src.denied")).toThrow("denied src.denied");
    expect(() => first.primitives.watermark("src.allowed")).not.toThrow();
    expect(first.entries).toHaveLength(0);
  });

  it("validates the key, the retention, and the cursor before anything is journaled", async () => {
    const first = drive({});
    expect(() => first.primitives.watermark("")).toThrow(WorkflowError);
    expect(() => first.primitives.watermark("src.a", { retention: { history: -1 } })).toThrow(
      /retention.history/,
    );
    await expect(
      first.primitives.watermark<number | undefined>("src.a").advance(undefined),
    ).rejects.toThrow(/must not be undefined/);
    expect(first.entries).toHaveLength(0);
  });

  it("recognizes only its own envelope version as restorable state", () => {
    expect(isWatermarkState({ v: 1, primitive: "watermark", source: "s", sources: {} })).toBe(true);
    expect(isWatermarkState({ v: 2, primitive: "watermark", source: "s", sources: {} })).toBe(
      false,
    );
    expect(isWatermarkState({ i: 1 })).toBe(false);
    expect(isWatermarkState(null)).toBe(false);
  });
});
