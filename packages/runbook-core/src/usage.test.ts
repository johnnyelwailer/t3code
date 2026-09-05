import { describe, expect, it } from "vite-plus/test";

import { createDurableRuntime } from "./durableRuntime.ts";
import type { JournalEntry } from "./journalReader.ts";
import { createUsageRecorder, summarizeUsage, type UsageRecord } from "./usage.ts";

const source = { now: () => 1_700_000_000_000, random: () => 0.25, uuid: () => "u" };
const NOW = "2026-08-02T00:00:00.000Z";

const makeSink = (entries: JournalEntry[]) => ({
  append: (entry: JournalEntry) => entries.push(entry),
  appendResolved: () => {},
  flush: async () => {},
  dispose: () => {},
});

describe("@runbook/core token-usage hook", () => {
  it("records usage into the journal and replays the recorded observations", async () => {
    const live: JournalEntry[] = [];
    const runtime = createDurableRuntime({
      journal: new Map(),
      writer: makeSink(live),
      source,
      runId: "run-1",
      nowIso: () => NOW,
    });
    const record = createUsageRecorder({ callPrimitive: runtime.callPrimitive, nowIso: () => NOW });
    await record({ inputTokens: 10, outputTokens: 5, model: "m", step: "plan" });
    await record({ inputTokens: 2, outputTokens: 3 });

    expect(live.map((entry) => entry.kind)).toEqual(["usage", "usage"]);
    expect(live[0]?.result).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      model: "m",
      step: "plan",
      at: NOW,
    });

    // Replay over the recorded journal: exec must not re-run, results are the recorded ones.
    const replay: JournalEntry[] = [];
    const replayed = createDurableRuntime({
      journal: new Map(live.map((entry) => [entry.seq, entry])),
      writer: makeSink(replay),
      source,
      runId: "run-1",
      nowIso: () => NOW,
    });
    const recordAgain = createUsageRecorder({
      callPrimitive: replayed.callPrimitive,
      nowIso: () => NOW,
    });
    await recordAgain({ inputTokens: 10, outputTokens: 5, model: "m", step: "plan" });
    await recordAgain({ inputTokens: 2, outputTokens: 3 });
    expect(replay).toEqual([]);
  });

  it("summarizes a run's usage records", () => {
    const records: UsageRecord[] = [
      { inputTokens: 10, outputTokens: 5, at: NOW },
      { inputTokens: 2, outputTokens: 3, at: NOW },
      { inputTokens: 0, outputTokens: 0, at: NOW },
    ];
    expect(summarizeUsage(records)).toEqual({ inputTokens: 12, outputTokens: 8, records: 3 });
    expect(summarizeUsage([])).toEqual({ inputTokens: 0, outputTokens: 0, records: 0 });
  });
});
