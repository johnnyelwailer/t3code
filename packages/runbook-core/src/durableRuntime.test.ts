import { describe, expect, it } from "vite-plus/test";

import { buildJournalMaps } from "./journalReader.ts";
import { toResolvedWire, toWire, type ResolvedWireInput } from "./journalWriter.ts";
import { createDurableRuntime } from "./durableRuntime.ts";
import type { JournalEntry } from "./journalReader.ts";
import type { JournalSink } from "./journalStore.ts";
import { type ReplyResolver, WorkflowSuspended } from "./handles.ts";

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

describe("@runbook/core durable runtime", () => {
  it("shares replay sequencing across deterministic, primitive, and handle calls", async () => {
    const firstJournal = makeMemoryJournal();
    let resolver: ReplyResolver | undefined;
    let fired = 0;
    let executed = 0;
    const source = {
      now: () => 1_700_000_000_000,
      random: () => 0.25,
      uuid: () => "uuid-1",
    };
    const runtime = createDurableRuntime({
      journal: new Map(),
      writer: firstJournal.sink,
      source,
      runId: "run-1",
      nowIso: () => "2026-08-02T00:00:00.000Z",
    });

    expect(runtime.now()).toBe(source.now());
    expect(runtime.random()).toBe(0.25);
    expect(runtime.uuid()).toBe("uuid-1");
    expect(
      await runtime.callPrimitive({
        kind: "custom.lookup",
        refId: "lookup",
        args: { id: "a" },
        exec: async () => {
          executed += 1;
          return { found: true };
        },
      }),
    ).toEqual({ found: true });

    const correlationId = await runtime.handles.send({
      kind: "custom.ask",
      refId: "ask",
      args: { prompt: "continue" },
      fire: async (_id, replyResolver) => {
        fired += 1;
        resolver = replyResolver;
      },
    });
    expect(correlationId).toBe("run-1:5");
    expect(runtime.currentSeq()).toBe(5);
    expect(fired).toBe(1);
    expect(executed).toBe(1);

    await expect(runtime.handles.awaitResolution(correlationId, undefined)).rejects.toBeInstanceOf(
      WorkflowSuspended,
    );
    resolver?.resolve({ approved: true });
    expect(await runtime.handles.awaitResolution(correlationId, undefined)).toEqual({
      approved: true,
    });

    expect(firstJournal.entries.map((entry) => [entry.seq, entry.kind])).toEqual([
      [1, "now"],
      [2, "random"],
      [3, "uuid"],
      [4, "custom.lookup"],
      [5, "custom.ask"],
    ]);

    const replayMaps = buildJournalMaps([
      ...firstJournal.entries.map(toWire),
      ...firstJournal.resolved.map(toResolvedWire),
    ]);
    const replayJournal = makeMemoryJournal();
    const replay = createDurableRuntime({
      journal: replayMaps.bySeq,
      writer: replayJournal.sink,
      resolved: replayMaps.byCorrelation,
      runId: "run-1",
      source: {
        now: () => {
          throw new Error("replay evaluated host clock");
        },
        random: () => {
          throw new Error("replay evaluated host entropy");
        },
        uuid: () => {
          throw new Error("replay evaluated host uuid");
        },
      },
      nowIso: () => "2026-08-02T00:00:00.000Z",
    });

    expect(replay.now()).toBe(source.now());
    expect(replay.random()).toBe(0.25);
    expect(replay.uuid()).toBe("uuid-1");
    expect(
      await replay.callPrimitive({
        kind: "custom.lookup",
        refId: "lookup",
        args: { id: "a" },
        exec: async () => {
          throw new Error("replay executed primitive");
        },
      }),
    ).toEqual({ found: true });
    expect(
      await replay.handles.send({
        kind: "custom.ask",
        refId: "ask",
        args: { prompt: "continue" },
        fire: async () => {
          throw new Error("replay fired handle");
        },
      }),
    ).toBe(correlationId);
    expect(await replay.handles.awaitResolution(correlationId, undefined)).toEqual({
      approved: true,
    });
    expect(replay.currentSeq()).toBe(5);
    expect(replayJournal.entries).toEqual([]);
  });
});
