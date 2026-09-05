// The #288 ownership boundary, tested at the core port. Delivery is AT-LEAST-ONCE: core
// journals the durable dispatch intent (stable correlationId) BEFORE firing and never
// re-fires a recorded sent entry on replay; a crash between intent and fire leaves a pending
// correlation the host retries with the SAME correlationId, and the host broker must be
// IDEMPOTENT (dedupe by correlationId) so one external effect lands per dispatch. The Nexi
// host provides that idempotency; a host that cannot must treat delivery as at-least-once.
import {
  buildJournalMaps,
  type JournalEntry,
  type ResolvedEntry,
} from "@runbook/core/journalReader";
import { toResolvedWire, toWire, type ResolvedWireInput } from "@runbook/core/journalWriter";
import { createDurableRuntime } from "@runbook/core/durableRuntime";
import type { JournalSink } from "@runbook/core/journalStore";
import { WorkflowSuspended } from "@runbook/core/handles";
import { describe, expect, it } from "vite-plus/test";

import { createMockBroker, type MessageBroker, type MessageEnvelope } from "./broker.ts";
import { createThreadPrimitives } from "./primitives.ts";

const NOW = "2026-08-02T00:00:00.000Z";
const SOURCE = { now: () => 1_700_000_000_000, random: () => 0.25, uuid: () => "thread-uuid-1" };
const PROMPT = "Summarize the log";

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
  broker: MessageBroker,
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

/** The host-side idempotency the #288 contract requires: one external effect per
 * correlationId, no matter how many times the host retries the dispatch. */
const makeIdempotentBroker = (): MessageBroker & { readonly effects: Map<string, number> } => {
  const effects = new Map<string, number>();
  return {
    effects,
    send: async (envelope, resolver) => {
      if ((effects.get(envelope.correlationId) ?? 0) === 0) effects.set(envelope.correlationId, 1);
      if (envelope.kind === "thread.turn") resolver.resolve("done");
    },
  };
};

const liveSentEntries = async (): Promise<JournalEntry[]> => {
  const liveJournal = makeMemoryJournal();
  const liveBroker = createMockBroker((envelope) =>
    envelope.kind === "thread.turn" ? { kind: "resolve", reply: "done" } : { kind: "defer" },
  );
  const agent = makeAgent(new Map(), new Map(), liveJournal.sink, liveBroker);
  expect(await agent.agent(PROMPT, { capabilities: "inherit" })).toBe("done");
  // One thread.create (one-way) + one thread.turn (ask) — the ONLY broker traffic.
  expect(liveBroker.sent.map((envelope) => envelope.kind)).toEqual([
    "thread.create",
    "thread.turn",
  ]);
  return liveJournal.entries;
};

const retryEnvelope = (correlationId: string): MessageEnvelope => ({
  correlationId,
  kind: correlationId === "run-1:1" ? "thread.create" : "thread.turn",
  payload: { threadId: "thread-uuid-1", prompt: PROMPT },
});

const NOOP_RESOLVER = { resolve: () => {}, reject: () => {} };

describe("agent primitive transport seam (#288 boundary)", () => {
  it("replays without redispatch — core never re-fires a recorded sent entry", async () => {
    const liveJournal = makeMemoryJournal();
    const liveBroker = createMockBroker((envelope) =>
      envelope.kind === "thread.turn" ? { kind: "resolve", reply: "done" } : { kind: "defer" },
    );
    const agent = makeAgent(new Map(), new Map(), liveJournal.sink, liveBroker);
    expect(await agent.agent(PROMPT, { capabilities: "inherit" })).toBe("done");

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
    expect(await replayAgent.agent(PROMPT, { capabilities: "inherit" })).toBe("done");
    expect(replayBroker.sent).toEqual([]);
    expect(replayJournal.entries).toEqual([]);
    expect(replayJournal.resolved).toEqual([]);
  });

  it("crash after intent, before fire: host retry with the SAME correlation applies one external effect", async () => {
    // The live segment journals the durable dispatch intent (sent entries) before firing.
    const sent = await liveSentEntries();
    const correlations = sent
      .map((entry) => entry.correlationId)
      .filter((id): id is string => id !== undefined);
    expect(correlations).toEqual(["run-1:1", "run-1:2"]);

    // CRASH WINDOW A: the process died after journaling the intent, before the broker
    // applied any external effect. Resume with NO resolved entries: replay parks on the
    // pending correlation and must not fire.
    const maps = buildJournalMaps(sent.map(toWire));
    const replayBroker = createMockBroker(() => {
      throw new Error("replay must not fire the broker");
    });
    const replayAgent = makeAgent(
      maps.bySeq,
      maps.byCorrelation,
      makeMemoryJournal().sink,
      replayBroker,
    );
    await expect(replayAgent.agent(PROMPT, { capabilities: "inherit" })).rejects.toThrow(
      WorkflowSuspended,
    );
    expect(replayBroker.sent).toEqual([]);

    // Host recovery: retry each pending correlation through the idempotent broker with the
    // SAME correlationId. Exactly one external effect per dispatch.
    const broker = makeIdempotentBroker();
    for (const correlationId of correlations)
      await broker.send(retryEnvelope(correlationId), NOOP_RESOLVER);
    expect([...broker.effects.values()]).toEqual([1, 1]);

    // The stable correlation settles the replayed await: resolve it and resume.
    const maps2 = buildJournalMaps([
      ...sent.map(toWire),
      toResolvedWire({
        correlationId: "run-1:2",
        kind: "thread.turn",
        refId: "thread-uuid-1",
        reply: "done",
        startedAt: NOW,
        endedAt: NOW,
      }),
    ]);
    const resumeAgent = makeAgent(
      maps2.bySeq,
      maps2.byCorrelation,
      makeMemoryJournal().sink,
      createMockBroker(() => {
        throw new Error("resume must not fire the broker");
      }),
    );
    expect(await resumeAgent.agent(PROMPT, { capabilities: "inherit" })).toBe("done");
  });

  it("crash after fire, before resolved: redelivery dedupes — still one external effect", async () => {
    // CRASH WINDOW B: the original fire applied one external effect per correlation, but the
    // resolved entry never landed. At-least-once delivery may redeliver the same dispatch.
    const sent = await liveSentEntries();
    const correlations = sent
      .map((entry) => entry.correlationId)
      .filter((id): id is string => id !== undefined);
    const broker = makeIdempotentBroker();
    for (const correlationId of correlations)
      await broker.send(retryEnvelope(correlationId), NOOP_RESOLVER);
    for (const correlationId of correlations)
      await broker.send(retryEnvelope(correlationId), NOOP_RESOLVER);
    // Redelivery of the SAME correlation must not apply a second external effect.
    expect([...broker.effects.values()]).toEqual([1, 1]);
  });
});
