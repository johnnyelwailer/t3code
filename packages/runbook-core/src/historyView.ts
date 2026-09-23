/**
 * Bounded execution — the `history(n)` read-side projection over checkpointed detail.
 *
 * `history(n)` is NOT a body primitive: it journals nothing. Every committed checkpoint already
 * records its ring capacity (`retainedHistory`) and closes one completed iteration; the ring is the
 * ordered outputs of the latest `retainedHistory` checkpoints, up to and including the active
 * boundary. This module derives that ring from the same `bySeq` map {@link selectReplayWindow}
 * reads, so a status read can expose recent iterations without hydrating superseded detail.
 *
 * Design invariants (docs/runbook/bounded-execution.md):
 *
 * - pure and host-neutral: same maps in, same ring out, for every `JournalStore` backend;
 * - the ACTIVE boundary's `retainedHistory` is the capacity — no valid checkpoint, no ring;
 * - only structurally valid checkpoints count, exactly as the replay window selects them;
 * - eviction is by capacity only: the ring is independent of how many other entries exist.
 */

import { CHECKPOINT_KIND, CHECKPOINT_REF_ID, isCheckpointRecord } from "./checkpoint.ts";
import { WorkflowError } from "./errors.ts";
import type { JournalMaps } from "./journalReader.ts";

/** One retained iteration output: the checkpoint that closed it and the state it committed. */
export interface HistoryEntry<State = unknown> {
  /** The closing checkpoint entry's seq. */
  readonly seq: number;
  readonly state: State;
  readonly at: string;
}

/**
 * Select the last `n` retained iteration outputs, oldest first. `n` is clamped to the active
 * boundary's `retainedHistory`: asking for more than the ring holds returns what is retained.
 * An empty journal, or one with no valid checkpoint, returns `[]`.
 */
export function selectHistoryView(maps: JournalMaps, n: number): ReadonlyArray<HistoryEntry> {
  if (!Number.isInteger(n) || n < 0) {
    throw new WorkflowError(`history: n must be a non-negative integer (got ${String(n)}).`);
  }
  const checkpoints: HistoryEntry[] = [];
  let capacity = 0;
  let activeSeq = -1;
  for (const entry of maps.bySeq.values()) {
    if (entry.kind !== CHECKPOINT_KIND || entry.refId !== CHECKPOINT_REF_ID) continue;
    if (!isCheckpointRecord(entry.result)) continue;
    checkpoints.push({ seq: entry.seq, state: entry.result.state, at: entry.result.at });
    if (entry.seq > activeSeq) {
      activeSeq = entry.seq;
      capacity = entry.result.retainedHistory;
    }
  }
  const take = Math.min(n, capacity);
  if (take === 0) return [];
  checkpoints.sort((a, b) => a.seq - b.seq);
  return checkpoints.slice(-take);
}
