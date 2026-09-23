/**
 * Replay-window conformance — the host-agnostic suite every {@link JournalStore} backend runs to
 * prove its optional {@link JournalStore.readReplayWindow} honors the bounded-replay contract
 * (`docs/runbook/bounded-execution.md`, phase 2: "JournalStore replay windows").
 *
 * It is deliberately host-neutral: it drives ONLY the store's own ports (`appendEntry` /
 * `appendResolved` / `readReplayWindow` / `clear`), seeds a KNOWN journal through them, and
 * cross-checks the store's window against the shared reference projection — {@link
 * selectReplayWindow} over the full journal — so the filesystem reference, the SQLite server
 * store, and (wave 2) a Temporal or Mastra adapter all run the SAME assertions against the SAME
 * selection rule. A backend may override the *materialization cost* (row-level windowing) but
 * must never diverge from the selection; the reference cross-check is what enforces that.
 *
 * Entry point: {@link runReplayWindowConformance}. It asserts, for a seeded journal, that
 *   1. **bounded suffix** — the materialized `bySeq` is exactly the entries strictly after the
 *      latest VALID checkpoint, and the full correlation map is retained;
 *   2. **no full-replay when a window exists** — a checkpoint strictly bounds materialization and
 *      the boundary entry itself is not materialized (the compact state replaces it);
 *   3. **deterministic rehydration** — repeated reads, and a `clear` + reseed, yield the same
 *      window (no live-clock or read-order dependence);
 *   4. **the full-replay fallback** — with no valid checkpoint the whole journal is the window
 *      (no retroactive magic);
 *   5. **error shape** — a checkpoint that collapsed an unsettled *resolvable* ask is reported via
 *      `unresolvedPrefixCorrelationIds` (one-way verbs excluded) and the engine's resume gate fails
 *      loud with the stable {@link WorkflowError} shape.
 *
 * Throws with a combined report when any invariant is violated; returns a summary when every check
 * passes. Import it as `import { runReplayWindowConformance } from "@runbook/core"` (also re-exported
 * through `@t3team/sdk`) and run it against your adapter's `JournalStore` before trusting its
 * resume path.
 */

import { canonicalJsonStringify } from "./canonicalJson.ts";
import {
  CHECKPOINT_KIND,
  CHECKPOINT_REF_ID,
  selectReplayWindow,
  type ReplayWindow,
} from "./checkpoint.ts";
import type { WorkflowReference } from "./engineTypes.ts";
import { executeWorkflowRun } from "./runEngine.ts";
import type { JournalEntry, JournalMaps } from "./journalReader.ts";
import { buildJournalMaps } from "./journalReader.ts";
import type { JournalStore } from "./journalStore.ts";
import type { ResolvedWireInput } from "./journalWriter.ts";
import { toResolvedWire, toWire } from "./journalWriter.ts";
import { WorkflowError } from "./errors.ts";

/** A `JournalStore` that implements the optional `readReplayWindow` (the target under test). */
export type ReplayWindowConformanceStore = JournalStore & {
  readonly readReplayWindow: NonNullable<JournalStore["readReplayWindow"]>;
};

export interface ReplayWindowConformanceReport {
  /** The store's own human-readable locator (file path, table ref, ...). */
  readonly locator: string;
  /** Number of independent scenarios exercised. */
  readonly scenarios: number;
}

// ── Deterministic journal fixtures (no live clock; fixed timestamps) ─────────────────
const NOW_ISO = "2026-09-01T00:00:00.000Z";

/** A call entry as the engine writes one. */
function callEntry(seq: number, kind: string, result: unknown, refId = "ref"): JournalEntry {
  return {
    seq,
    callId: `${seq}:${kind}:${refId}`,
    kind,
    refId,
    argsHash: `hash-${seq}`,
    result,
    startedAt: NOW_ISO,
    endedAt: NOW_ISO,
  };
}

/** A fired-but-unresolved Handle `sent` entry (carries a correlationId, no result). */
function sentEntry(seq: number, kind: string, correlationId: string): JournalEntry {
  return {
    seq,
    callId: `${seq}:${kind}:${correlationId}`,
    kind,
    refId: "ref",
    argsHash: `hash-${seq}`,
    result: undefined,
    phase: "sent",
    correlationId,
    startedAt: NOW_ISO,
    endedAt: NOW_ISO,
  };
}

/** A structurally valid checkpoint boundary. */
function checkpointEntry(seq: number, compactedThroughSeq: number, state: unknown): JournalEntry {
  return callEntry(
    seq,
    CHECKPOINT_KIND,
    { compactedThroughSeq, state, retainedHistory: 0, at: NOW_ISO },
    CHECKPOINT_REF_ID,
  );
}

/** A checkpoint-shaped entry whose result is NOT a valid CheckpointRecord (not authority). */
function corruptCheckpointEntry(seq: number, state: unknown): JournalEntry {
  return callEntry(
    seq,
    CHECKPOINT_KIND,
    { compactedThroughSeq: "corrupt", state, retainedHistory: 0, at: NOW_ISO },
    CHECKPOINT_REF_ID,
  );
}

function reply(correlationId: string, kind: string, refId: string, value: unknown): ResolvedWireInput {
  return { correlationId, kind, refId, reply: value, startedAt: NOW_ISO, endedAt: NOW_ISO };
}

// ── The shared reference + comparison ────────────────────────────────────────────────

/** The ground-truth window: the reference projection over the full journal (what {@link
 * FsJournalStore.readReplayWindow} produces). */
function referenceWindow(entries: readonly JournalEntry[], replies: readonly ResolvedWireInput[]): ReplayWindow {
  const maps: JournalMaps = buildJournalMaps([
    ...entries.map(toWire),
    ...replies.map(toResolvedWire),
  ]);
  return selectReplayWindow(maps);
}

/** A stable, order-independent representation of a window for comparison. */
function normalizeWindow(window: ReplayWindow): unknown {
  return {
    checkpoint: window.checkpoint ?? null,
    totalEntries: window.totalEntries,
    materializedEntries: window.materializedEntries,
    unresolvedPrefixCorrelationIds: [...window.unresolvedPrefixCorrelationIds].sort(),
    bySeq: [...window.entries.bySeq.entries()].sort((a, b) => a[0] - b[0]),
    byCorrelation: [...window.entries.byCorrelation.entries()].sort((a, b) =>
      String(a[0]).localeCompare(String(b[0])),
    ),
  };
}

/** Throw when the store's window diverges from the reference selection (the master invariant). */
function assertMatchesReference(actual: ReplayWindow, reference: ReplayWindow, where: string): void {
  const a = canonicalJsonStringify(normalizeWindow(actual));
  const r = canonicalJsonStringify(normalizeWindow(reference));
  if (a !== r) {
    throw new Error(
      `[replay-window conformance] ${where}: the store's readReplayWindow diverged from the ` +
        `shared selectReplayWindow projection.\n  store:     ${a}\n  reference: ${r}`,
    );
  }
}

async function seed(store: ReplayWindowConformanceStore, runId: string, entries: readonly JournalEntry[], replies: readonly ResolvedWireInput[]): Promise<void> {
  for (const entry of entries) await store.appendEntry(runId, entry);
  for (const resolved of replies) await store.appendResolved(runId, resolved);
}

/**
 * Run the checkpoint-aware replay-window conformance suite against a `JournalStore` backend.
 *
 * Seeds a fresh, scenario-scoped run id under `baseRunId` for each case (so scenarios do not
 * share state and a backend without idempotent `clear` still passes), asserts the window
 * invariants, and throws with a combined report on the first violated invariant.
 */
export async function runReplayWindowConformance(
  store: ReplayWindowConformanceStore,
  baseRunId: string,
): Promise<ReplayWindowConformanceReport> {
  const locator = store.locator(`${baseRunId}:conformance`);
  const failures: string[] = [];
  const fail = (label: string, detail: string): void => {
    failures.push(`${label} — ${detail}`);
  };

  // Scenario 1 + 2: bounded suffix, no full-replay, full correlation map, latest-VALID boundary.
  {
    const runId = `${baseRunId}:s1`;
    const entries = [
      callEntry(1, "tool", "a"),
      callEntry(2, "tool", "b"),
      sentEntry(3, "wait.until", "c3"),
      callEntry(4, "tool", "c"),
      checkpointEntry(5, 4, { i: 2 }),
      callEntry(6, "tool", "d"),
      callEntry(7, "tool", "e"),
      checkpointEntry(8, 7, { i: 4 }), // latest VALID boundary
      callEntry(9, "tool", "f"),
      corruptCheckpointEntry(10, { i: 5 }), // a later corrupt boundary is NOT authority
    ];
    const replies = [reply("c3", "wait.until", "ref", true)];
    await seed(store, runId, entries, replies);

    const window = await store.readReplayWindow(runId);
    assertMatchesReference(window, referenceWindow(entries, replies), "s1 (checkpointed, settled ask, corrupt later boundary)");
    if (window.checkpoint?.seq !== 8) {
      fail("s1 boundary", `expected the latest VALID checkpoint at seq 8, got ${String(window.checkpoint?.seq)}`);
    }
    if (window.totalEntries !== 10) {
      fail("s1 total", `expected 10 logical entries, got ${window.totalEntries}`);
    }
    if (window.materializedEntries !== 2) {
      fail("s1 materialized", `expected 2 (suffix strictly after seq 8), got ${window.materializedEntries}`);
    }
    const suffixKeys = [...window.entries.bySeq.keys()].sort((a, b) => a - b);
    if (canonicalJsonStringify(suffixKeys) !== canonicalJsonStringify([9, 10])) {
      fail("s1 suffix keys", `expected [9,10], got ${JSON.stringify(suffixKeys)}`);
    }
    // no full-replay when a window exists: strictly bounded, and the boundary itself is not materialized.
    if (!(window.materializedEntries < window.totalEntries)) {
      fail("s1 bounded", `materialized (${window.materializedEntries}) must be < total (${window.totalEntries})`);
    }
    if (window.entries.bySeq.has(8)) {
      fail("s1 boundary materialized", "the boundary entry must NOT be materialized (the compact state replaces it)");
    }
    if (window.entries.byCorrelation.size !== 1) {
      fail("s1 correlation map", `expected the full 1-entry correlation map, got ${window.entries.byCorrelation.size}`);
    }
    if (window.unresolvedPrefixCorrelationIds.length !== 0) {
      fail("s1 settled ask", `a settled resolvable ask must NOT be flagged, got ${JSON.stringify(window.unresolvedPrefixCorrelationIds)}`);
    }
  }

  // Scenario 3: deterministic rehydration (repeated reads + clear/reseed).
  {
    const runId = `${baseRunId}:s3`;
    const entries = [
      callEntry(1, "tool", "a"),
      checkpointEntry(2, 1, { i: 1 }),
      callEntry(3, "tool", "b"),
      callEntry(4, "tool", "c"),
    ];
    const replies: ResolvedWireInput[] = [];
    await seed(store, runId, entries, replies);

    const w1 = await store.readReplayWindow(runId);
    const w2 = await store.readReplayWindow(runId);
    const w3 = await store.readReplayWindow(runId);
    const sig1 = canonicalJsonStringify(normalizeWindow(w1));
    if (sig1 !== canonicalJsonStringify(normalizeWindow(w2))) {
      fail("s3 determinism", "two reads of the same journal diverged");
    }
    if (sig1 !== canonicalJsonStringify(normalizeWindow(w3))) {
      fail("s3 determinism", "three reads of the same journal diverged");
    }
    await store.clear(runId);
    await seed(store, runId, entries, replies);
    const w4 = await store.readReplayWindow(runId);
    if (sig1 !== canonicalJsonStringify(normalizeWindow(w4))) {
      fail("s3 rehydration", "clear + reseed did not rehydrate the same window");
    }
  }

  // Scenario 4: no valid checkpoint → the whole journal is the window (no retroactive magic).
  {
    const runId = `${baseRunId}:s4`;
    const entries = [
      callEntry(1, "tool", "a"),
      sentEntry(2, "wait.until", "c2"),
      callEntry(3, "tool", "b"),
    ];
    const replies = [reply("c2", "wait.until", "ref", "ok")];
    await seed(store, runId, entries, replies);

    const window = await store.readReplayWindow(runId);
    assertMatchesReference(window, referenceWindow(entries, replies), "s4 (no checkpoint)");
    if (window.checkpoint !== undefined) {
      fail("s4 no checkpoint", `expected no checkpoint, got seq ${String(window.checkpoint?.seq)}`);
    }
    if (window.totalEntries !== 3 || window.materializedEntries !== 3) {
      fail("s4 full replay", `expected total === materialized === 3, got total=${window.totalEntries} materialized=${window.materializedEntries}`);
    }
  }

  // Scenario 5: a checkpoint that collapsed an unsettled RESOLVABLE ask is reported and fails loud.
  {
    const runId = `${baseRunId}:s5`;
    const entries = [
      sentEntry(1, "wait.until", "c1"), // resolvable + UNSETTLED, in the collapsed prefix
      sentEntry(2, "thread.create", "c2"), // one-way verb: never settles, must be excluded
      callEntry(3, "tool", "a"),
      checkpointEntry(4, 3, { i: 1 }),
      callEntry(5, "tool", "b"),
    ];
    const replies: ResolvedWireInput[] = [];
    await seed(store, runId, entries, replies);

    const window = await store.readReplayWindow(runId);
    assertMatchesReference(window, referenceWindow(entries, replies), "s5 (unsafe prefix)");
    if (canonicalJsonStringify([...window.unresolvedPrefixCorrelationIds].sort()) !== canonicalJsonStringify(["c1"])) {
      fail(
        "s5 unsafe report",
        `expected the unsettled resolvable ask ['c1'] flagged with the one-way 'c2' excluded, got ${JSON.stringify(
          window.unresolvedPrefixCorrelationIds,
        )}`,
      );
    }
    const ref: WorkflowReference = { path: "conformance.workflow.ts" };
    let gateError: unknown;
    try {
      await executeWorkflowRun({
        runId,
        ref,
        args: {},
        runsRoot: "memory://runs",
        store,
        options: {},
        // The window gate must reject BEFORE the body runs; if it ever reaches here the check was skipped.
        body: async () => "the body must not run behind an unsafe checkpoint window",
      });
    } catch (error) {
      gateError = error;
    }
    if (!(gateError instanceof WorkflowError)) {
      fail(
        "s5 error shape",
        `expected the engine's resume gate to throw WorkflowError, got ${gateError instanceof Error ? gateError.message : String(gateError)}`,
      );
    } else if (!/cannot resume from checkpoint/.test(gateError.message)) {
      fail("s5 error shape", `expected the stable 'cannot resume from checkpoint' message, got '${gateError.message}'`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Replay-window conformance FAILED for store '${locator}':\n  - ${failures.join("\n  - ")}`);
  }
  return { locator, scenarios: 5 };
}
