import { describe, expect, it } from "vite-plus/test";

import { selectReplayWindow } from "./checkpoint.ts";
import { runReplayWindowConformance } from "./journalStoreConformance.ts";
import { buildJournalMaps, type JournalEntry, type JournalMaps } from "./journalReader.ts";
import type { RunMeta } from "./journal.ts";
import type { JournalStore } from "./journalStore.ts";
import { toResolvedWire, toWire, type ResolvedWireInput } from "./journalWriter.ts";

/**
 * The in-memory REFERENCE backend: it stores the exact wire objects a backend must persist and
 * derives `readReplayWindow` by the shared reference rule ({@link selectReplayWindow} over the full
 * journal). It is the "known-correct" store the conformance suite is guaranteed to pass against —
 * the job of every other backend (the SQLite server store, and wave-2 Temporal/Mastra adapters) is
 * to pass the SAME suite without diverging from this projection.
 */
class MemoryReplayStore implements JournalStore {
  private readonly wires = new Map<string, unknown[]>();
  private readonly metas = new Map<string, RunMeta>();

  private push(runId: string, wire: unknown): void {
    const existing = this.wires.get(runId);
    if (existing === undefined) this.wires.set(runId, [wire]);
    else existing.push(wire);
  }

  async appendEntry(runId: string, entry: JournalEntry): Promise<void> {
    this.push(runId, toWire(entry));
  }

  async appendResolved(runId: string, resolved: ResolvedWireInput): Promise<void> {
    this.push(runId, toResolvedWire(resolved));
  }

  async readEntries(runId: string): Promise<JournalMaps> {
    return buildJournalMaps(this.wires.get(runId) ?? []);
  }

  async readReplayWindow(runId: string) {
    return selectReplayWindow(await this.readEntries(runId));
  }

  async readRunMeta(runId: string): Promise<RunMeta | undefined> {
    return this.metas.get(runId);
  }

  async writeRunMeta(runId: string, meta: RunMeta): Promise<void> {
    this.metas.set(runId, meta);
  }

  async hasRun(runId: string): Promise<boolean> {
    return this.wires.has(runId);
  }

  async clear(runId: string): Promise<void> {
    this.wires.delete(runId);
    this.metas.delete(runId);
  }

  locator(runId: string): string {
    return `memory://runs/${runId}`;
  }
}

describe("@runbook/core replay-window conformance (reference store)", () => {
  it("passes every window invariant against the in-memory reference backend", async () => {
    const report = await runReplayWindowConformance(new MemoryReplayStore(), "host-run");
    expect(report.scenarios).toBe(5);
    expect(report.locator).toContain("memory://");
  });

  it("surfaces a divergent store through the shared reference cross-check", async () => {
    // A backend that reports the FULL journal as the materialized set when a checkpoint bounds it
    // is exactly the regression the bounded-replay contract exists to stop: it "works" but silently
    // rehydrates the whole prefix. The suite must reject it.
    const fullReplayStore = new MemoryReplayStore();
    const poisoned = new Proxy(fullReplayStore, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === "readReplayWindow") {
          return async (runId: string) => {
            // Deliberately materialize the whole journal instead of the bounded suffix.
            const maps = await target.readEntries(runId);
            return {
              checkpoint: undefined,
              entries: maps,
              totalEntries: maps.bySeq.size,
              materializedEntries: maps.bySeq.size,
              unresolvedPrefixCorrelationIds: [],
            };
          };
        }
        return value;
      },
    });
    await expect(runReplayWindowConformance(poisoned, "host-run")).rejects.toThrow(
      /replay-window conformance|Replay-window conformance FAILED/,
    );
  });
});
