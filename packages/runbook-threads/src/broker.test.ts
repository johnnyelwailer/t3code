import { describe, expect, it } from "vite-plus/test";

import type { JournalEntry, JournalMaps } from "@runbook/core/journalReader";
import type { JournalStore } from "@runbook/core/journalStore";
import { appendResolvedEntry, createHostBroker } from "./broker.ts";

const sentEntry = (correlationId: string): JournalEntry => ({
  seq: 1,
  callId: "1:thread.turn",
  kind: "thread.turn",
  refId: "thread.turn",
  argsHash: "hash",
  result: undefined,
  phase: "sent",
  correlationId,
  startedAt: "2026-08-02T00:00:00.000Z",
  endedAt: "2026-08-02T00:00:00.000Z",
});

function memoryStore(initial: JournalEntry): JournalStore & { readonly resolved: unknown[] } {
  const maps: JournalMaps = {
    bySeq: new Map([[initial.seq, initial]]),
    byCorrelation: new Map(),
  };
  const resolved: unknown[] = [];
  return {
    resolved,
    appendEntry: async () => {},
    appendResolved: async (_runId, input) => {
      resolved.push(input);
      maps.byCorrelation.set(input.correlationId, {
        correlationId: input.correlationId,
        kind: input.kind,
        refId: input.refId,
        dismissed: input.dismissed === true,
        reply: input.reply,
      });
    },
    readEntries: async () => maps,
    readRunMeta: async () => undefined,
    writeRunMeta: async () => {},
    hasRun: async () => true,
    clear: async () => {},
    locator: (runId) => `memory:${runId}`,
  };
}

describe("host-neutral thread broker", () => {
  it("routes ordinary envelopes without settling their out-of-band resolver", async () => {
    const received: string[] = [];
    let resolved = false;
    const broker = createHostBroker({
      "thread.turn": async (envelope) => {
        received.push(envelope.correlationId);
      },
    });

    await broker.send(
      { correlationId: "run-1:1", kind: "thread.turn", payload: { threadId: "thread-1" } },
      { resolve: () => (resolved = true), reject: () => {} },
    );

    expect(received).toEqual(["run-1:1"]);
    expect(resolved).toBe(false);
  });

  it("appends an external reply once and ignores a late duplicate", async () => {
    const store = memoryStore(sentEntry("run-1:1"));
    const opts = {
      store,
      runId: "run-1",
      correlationId: "run-1:1",
      reply: { answer: "approved" },
      nowIso: () => "2026-08-02T00:01:00.000Z",
    };

    await expect(appendResolvedEntry(opts)).resolves.toBe(true);
    await expect(appendResolvedEntry(opts)).resolves.toBe(false);
    expect(store.resolved).toHaveLength(1);
    expect(store.resolved[0]).toMatchObject({
      correlationId: "run-1:1",
      kind: "thread.turn",
      refId: "thread.turn",
      reply: { answer: "approved" },
    });
  });

  it("rejects a reply that has no matching open handle", async () => {
    const store = memoryStore(sentEntry("run-1:1"));

    await expect(
      appendResolvedEntry({
        store,
        runId: "run-1",
        correlationId: "run-1:missing",
        reply: "late",
      }),
    ).rejects.toThrow("no matching 'sent' entry");
  });
});
