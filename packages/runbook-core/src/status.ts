/**
 * Journal-derived run status — a host-neutral read of where a run stands, from the journal
 * and run metadata alone.
 *
 * The core cannot know LIVENESS (whether a process is currently executing the run) — that is
 * a host concern (its controller registry). What it CAN say, durably: the run is empty,
 * in-progress, parked on a pending handle, or settled (completed / failed / aborted, from the
 * terminal marker the engine writes). Hosts overlay liveness on top of this.
 */

import type { ArtifactRecord } from "./artifacts.ts";
import type { RunMeta } from "./journal.ts";
import type { JournalStore } from "./journalStore.ts";
import type { UsageRecord, UsageTotals } from "./usage.ts";
import { summarizeUsage } from "./usage.ts";

/** The durable states a journal can prove. */
export type RunState = "empty" | "in-progress" | "suspended" | "completed" | "failed" | "aborted";

export interface RunStatus {
  readonly state: RunState;
  /** Recorded run inputs, when the engine wrote them. */
  readonly meta?: RunMeta;
  /** Number of seq-keyed journal entries (calls + sent handles). */
  readonly entryCount: number;
  /** Highest journaled seq, or 0 for an empty run. */
  readonly lastSeq: number;
  /** Correlation ids of `sent` handles with no recorded reply yet — what a resume awaits. */
  readonly pendingCorrelationIds: readonly string[];
  /** The run's journaled artifacts, in emission order. */
  readonly artifacts: readonly ArtifactRecord[];
  /** Aggregated token usage recorded into the run. */
  readonly usage: UsageTotals;
}

/**
 * Read a run's durable status. A run id with NO run metadata at all reports
 * `{ state: "empty" }` — the same shape a host uses for "not started". Once the engine has
 * written the run's metadata the run is in-progress until a terminal marker lands, even with
 * zero journal entries: a resumed re-drive clears the stale terminal before any new work is
 * journaled, and that window must read as active, not "completed" or "empty".
 */
export async function inspectRun(store: JournalStore, runId: string): Promise<RunStatus> {
  const [meta, entries] = await Promise.all([store.readRunMeta(runId), store.readEntries(runId)]);
  const pendingCorrelationIds: string[] = [];
  const artifacts: ArtifactRecord[] = [];
  const usage: UsageRecord[] = [];
  let lastSeq = 0;
  for (const entry of entries.bySeq.values()) {
    if (entry.seq > lastSeq) lastSeq = entry.seq;
    if (entry.phase === "sent" && entry.correlationId !== undefined) {
      if (!entries.byCorrelation.has(entry.correlationId))
        pendingCorrelationIds.push(entry.correlationId);
    }
    // Safe casts: only createArtifactEmitter / createUsageRecorder journal those kinds.
    if (entry.kind === "artifact" && entry.result !== undefined)
      artifacts.push(entry.result as ArtifactRecord);
    if (entry.kind === "usage" && entry.result !== undefined)
      usage.push(entry.result as UsageRecord);
  }
  const state: RunState =
    meta?.terminal !== undefined
      ? meta.terminal
      : pendingCorrelationIds.length > 0
        ? "suspended"
        : meta === undefined
          ? "empty"
          : "in-progress";
  return {
    state,
    ...(meta === undefined ? {} : { meta }),
    entryCount: entries.bySeq.size,
    lastSeq,
    pendingCorrelationIds,
    artifacts,
    usage: summarizeUsage(usage),
  };
}
