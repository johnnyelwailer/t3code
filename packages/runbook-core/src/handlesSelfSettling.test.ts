import { describe, expect, it } from "vite-plus/test";

import { createDurableRuntime } from "./durableRuntime.ts";
import type { FireDelivery } from "./handles.ts";
import { buildJournalMaps } from "./journalReader.ts";
import { toWire } from "./journalWriter.ts";

const source = { now: () => 1_700_000_000_000, random: () => 0.5, uuid: () => "uuid-1" };
const sink = {
  append: () => {},
  appendResolved: () => {},
  flush: async () => {},
  dispose: () => {},
};

/** A run that recorded one `sent` entry of `kind` and died before the host's reply. */
function recordedUnanswered(kind: string) {
  const wires: Array<Record<string, unknown>> = [];
  const first = createDurableRuntime({
    journal: new Map(),
    writer: { ...sink, append: (entry) => wires.push(toWire(entry)) },
    source,
    runId: "run-1",
  });
  void first.handles.send({ kind, refId: "r", args: { n: 1 }, fire: async () => {} });
  return buildJournalMaps(wires);
}

/** Replays the journal and reports what a fresh `send` of the recorded call fired. */
async function replayFires(
  kind: string,
  maps: ReturnType<typeof buildJournalMaps>,
): Promise<{ id: string; deliveries: Array<FireDelivery | undefined> }> {
  const deliveries: Array<FireDelivery | undefined> = [];
  const replay = createDurableRuntime({
    journal: maps.bySeq,
    resolved: maps.byCorrelation,
    writer: sink,
    source,
    runId: "run-1",
  });
  const id = await replay.handles.send({
    kind,
    refId: "r",
    args: { n: 1 },
    fire: async (_cid, _resolver, delivery) => {
      deliveries.push(delivery);
    },
  });
  return { id, deliveries };
}

describe("@runbook/core self-settling idempotent host requests", () => {
  it("sends an unanswered launchThread-family request again on replay, marked as a redelivery", async () => {
    for (const kind of ["thread.launch", "thread.launched", "run.facts", "config.resolve"]) {
      const { id, deliveries } = await replayFires(kind, recordedUnanswered(kind));
      expect(id, kind).toBe("run-1:1");
      expect(deliveries, kind).toEqual([{ redelivery: true }]);
    }
  });

  it("does not send an answered one again", async () => {
    const maps = recordedUnanswered("thread.launch");
    maps.byCorrelation.set("run-1:1", {
      correlationId: "run-1:1",
      kind: "thread.launch" as never,
      refId: "r",
      dismissed: false,
      reply: { ok: true },
    });
    expect((await replayFires("thread.launch", maps)).deliveries).toEqual([]);
  });

  it("leaves every other kind parked: a replayed ask is never fired twice by accident", async () => {
    const { deliveries } = await replayFires("thread.turn", recordedUnanswered("thread.turn"));
    expect(deliveries).toEqual([]);
  });
});
