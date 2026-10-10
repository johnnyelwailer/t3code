// @effect-diagnostics nodeBuiltinImport:off - the suite drives the real fs journal on disk.
/**
 * The replay-window conformance suite itself: it must PASS against a conformant store
 * (FsJournalStore, the reference fs host) and FAIL against a store whose window ignores the
 * checkpoint contract — a conformance suite that cannot fail proves nothing.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";

import { selectReplayWindow, type ReplayWindow } from "./checkpoint.ts";
import { runReplayWindowConformance } from "./journalStoreConformance.ts";
import { FsJournalStore, type JournalStore } from "./journalStore.ts";

const tmpRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-conformance-"));
afterAll(() => NodeFS.rmSync(tmpRoot, { recursive: true, force: true }));

/** A store that reports a full-replay window even when a valid checkpoint boundary exists —
 * the canonical row-level backend that drifts from the shared selection rule. */
class FullReplayImpostorStore extends FsJournalStore {
  override async readReplayWindow(runId: string): Promise<ReplayWindow> {
    const maps = await this.readEntries(runId);
    return {
      ...selectReplayWindow(maps),
      checkpoint: undefined,
      entries: maps,
      totalEntries: maps.bySeq.size,
      materializedEntries: maps.bySeq.size,
    };
  }
}

/** A `JournalStore` that exposes the full journal surface but never the optional bounded-replay
 * window — the suite must refuse it at the `readReplayWindow` check, before any storage method is
 * exercised. `FsJournalStore` declares the method as required, so shadow it with an own property
 * rather than overriding (a subclass cannot widen it to `undefined`). */
function makeNoWindowStore(runsRoot: string): JournalStore {
  const store = new FsJournalStore(runsRoot);
  Object.defineProperty(store, "readReplayWindow", { value: undefined });
  return store;
}

describe("@runbook/core JournalStore replay-window conformance", () => {
  it("passes against FsJournalStore (the reference host)", async () => {
    const report = await runReplayWindowConformance(new FsJournalStore(tmpRoot));
    expect(report.passed).toContain(
      "conformance:bounded: window matches the shared reference selection",
    );
    expect(report.passed).toContain(
      "conformance:bounded: bounded suffix (no prefix entry materialized)",
    );
    expect(report.passed).toContain(
      "conformance:bounded: engine replays only the bounded suffix (no full replay) and seeds the boundary",
    );
    expect(report.passed).toContain(
      "conformance:unsafe: store cannot honor the window: the engine fails loud (WorkflowError) before the body runs",
    );
    expect(report.passed).toContain(
      "conformance:long-lived: bounded suffix (no prefix entry materialized)",
    );
    expect(report.passed.length).toBeGreaterThanOrEqual(14);
  });

  it("fails against a store whose readReplayWindow ignores the checkpoint", async () => {
    await expect(runReplayWindowConformance(new FullReplayImpostorStore(tmpRoot))).rejects.toThrow(
      /\[replay-window conformance\] conformance:bounded — reference parity/,
    );
  });

  it("fails against a store without readReplayWindow", async () => {
    await expect(runReplayWindowConformance(makeNoWindowStore(tmpRoot))).rejects.toThrow(
      /does not implement readReplayWindow/,
    );
  });

  it("leaves the store clean after a run", async () => {
    // `clear` truncates the journal to an empty file (it does not unlink it), so "clean" means
    // no conformance entries remain — not that the run's journal file is gone.
    const store: JournalStore = new FsJournalStore(tmpRoot);
    await runReplayWindowConformance(store);
    for (const runId of [
      "conformance:no-checkpoint",
      "conformance:bounded",
      "conformance:unsafe",
      "conformance:long-lived",
    ]) {
      const maps = await store.readEntries(runId);
      expect(maps.bySeq.size).toBe(0);
      expect(maps.byCorrelation.size).toBe(0);
    }
  });
});
