// The #288 ownership boundary, tested at the core port: agent turns cross the
// handle-dispatch fire → broker.send seam exactly once per process lifetime.
// A host-owned AgentStepBridge binds this seam; core journals the sent/resolved
// pair and NEVER re-fires on replay — the bridge must not own journal or status.
import {
  buildJournalMaps,
  type JournalEntry,
  type ResolvedEntry,
} from "@runbook/core/journalReader";
import { toResolvedWire, toWire } from "@runbook/core/journalWriter";
import { createDurableRuntime } from "@runbook/core/durableRuntime";
import type { ResolvedWireInput } from "@runbook/core/journalWriter";
import type { JournalSink } from "@runbook/core/journalStore";
import { describe, expect, it } from "vite-plus/test";

import { createMockBroker } from "./broker.ts";
import { createThreadPrimitives } from "./primitives.ts";

const NOW = "2026-08-02T00:00:00.000Z";
const SOURCE = { now: () => 1_700_000_000_000, random: () => 0.25, uuid: () => "thread-uuid-1" };

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
      appendResolved: (input) => resolved.push(input),
      flush: async () => {},
      dispose: () => {},
    },
  };
};

const makeAgent = (
  journal: ReadonlyMap<number, JournalEntry>,
  resolved: ReadonlyMap<string, ResolvedEntry>,
  sink: JournalSink,
  broker: ReturnType<typeof createMockBroker>,
) => {
  const runtime = createDurableRuntime({
    journal,
    writer: sink,
    resolved,
    source: SOURCE,
    runId: "run-1",
    nowIso: () => NOW,
  });
  return createThreadPrimitives({
    dispatch: runtime.handles,
    broker,
    capabilities: new Set(["thread.create", "thread.turn"]),
    launchThreadId: undefined,
    defaultModel: undefined,
  });
};

describe("agent primitive transport seam (#288 boundary)", () => {
  it("dispatches exactly once through the broker and replays without redispatch", async () => {
    const liveJournal = makeMemoryJournal();
    const liveBroker = createMockBroker((envelope) =>
      envelope.kind === "thread.turn" ? { kind: "resolve", reply: "done" } : { kind: "defer" },
    );
    const agent = makeAgent(new Map(), new Map(), liveJournal.sink, liveBroker);
    const result = await agent.agent("Summarize the log", { capabilities: "inherit" });
    expect(result).toBe("done");
    // One thread.create (one-way) + one thread.turn (ask) — the ONLY broker traffic.
    expect(liveBroker.sent.map((envelope) => envelope.kind)).toEqual([
      "thread.create",
      "thread.turn",
    ]);

    // Replay: same journal, a FRESH broker. The journaled sent/resolved pair settles the
    // turn from the record — zero broker sends, zero new journal entries, same reply.
    const maps = buildJournalMaps([
      ...liveJournal.entries.map(toWire),
      ...liveJournal.resolved.map(toResolvedWire),
    ]);
    const replayJournal = makeMemoryJournal();
    const replayBroker = createMockBroker(() => {
      throw new Error("replay must not fire the broker");
    });
    const replayAgent = makeAgent(maps.bySeq, maps.byCorrelation, replayJournal.sink, replayBroker);
    expect(await replayAgent.agent("Summarize the log", { capabilities: "inherit" })).toBe("done");
    expect(replayBroker.sent).toEqual([]);
    expect(replayJournal.entries).toEqual([]);
    expect(replayJournal.resolved).toEqual([]);
  });
});
