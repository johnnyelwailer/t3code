/**
 * Bounded execution — the `history(n)` read-side projection over checkpointed detail.
 *
 * `history(n)` is NOT a body primitive: it journals nothing of its own. Every committed checkpoint
 * records its ring capacity (`retainedHistory`) and the ring itself (`CheckpointRecord.history`):
 * the previous record's ring plus its own state, capped at that capacity. A status read therefore
 * reads ONLY the active boundary's record — O(1) in the journal, and still correct once superseded
 * detail is physically pruned (docs/runbook/bounded-execution.md: "Rehydrate the recorded ring
 * without scanning old detail").
 *
 * The ring is the last N checkpoints OF THE RUN, not of one loop: a second loop, or an inline
 * sub-workflow that checkpoints in the parent's journal sequence, composes into the same ring.
 *
 * Design invariants:
 *
 * - pure and host-neutral: same maps in, same ring out, for every `JournalStore` backend;
 * - the ACTIVE boundary's `retainedHistory` is the capacity — no valid checkpoint, no ring;
 * - only structurally valid checkpoints count, exactly as the replay window selects them;
 * - eviction is by capacity only: the ring is independent of how many other entries exist.
 *
 * Backward compatibility: an active record journaled before rings were recorded has no `history`;
 * for that record only, the ring is derived by scanning the earlier valid checkpoints in `bySeq`.
 */

import {
  CHECKPOINT_KIND,
  CHECKPOINT_REF_ID,
  isCheckpointRecord,
  type CheckpointRecord,
  type HistoryEntry,
} from "./checkpoint.ts";
import { WorkflowError } from "./errors.ts";
import type { JournalEntry, JournalMaps } from "./journalReader.ts";

/**
 * Select the last `n` retained iteration outputs, oldest first. `n` is clamped to the active
 * boundary's `retainedHistory`: asking for more than the ring holds returns what is retained.
 * An empty journal, or one with no valid checkpoint, returns `[]`.
 */
export function selectHistoryView(maps: JournalMaps, n: number): ReadonlyArray<HistoryEntry> {
  if (!Number.isInteger(n) || n < 0) {
    throw new WorkflowError(`history: n must be a non-negative integer (got ${String(n)}).`);
  }
  // Same boundary rule as selectReplayWindow: the latest valid checkpoint by seq is active.
  let active: { readonly seq: number; readonly record: CheckpointRecord } | undefined;
  for (const entry of maps.bySeq.values()) {
    if (!isValidCheckpoint(entry)) continue;
    if (active === undefined || entry.seq > active.seq) {
      active = { seq: entry.seq, record: entry.result };
    }
  }
  const take = Math.min(n, active?.record.retainedHistory ?? 0);
  if (active === undefined || take === 0) return [];
  const ring = active.record.history ?? scanRing(maps, active.seq);
  return ring.slice(-take);
}

function isValidCheckpoint(
  entry: JournalEntry,
): entry is JournalEntry & { readonly result: CheckpointRecord } {
  return (
    entry.kind === CHECKPOINT_KIND &&
    entry.refId === CHECKPOINT_REF_ID &&
    isCheckpointRecord(entry.result)
  );
}

/** Legacy fallback: every valid checkpoint up to the active boundary, in seq order. */
function scanRing(maps: JournalMaps, throughSeq: number): HistoryEntry[] {
  const checkpoints: HistoryEntry[] = [];
  for (const entry of maps.bySeq.values()) {
    if (entry.seq > throughSeq || !isValidCheckpoint(entry)) continue;
    checkpoints.push({ seq: entry.seq, state: entry.result.state, at: entry.result.at });
  }
  return checkpoints.sort((a, b) => a.seq - b.seq);
}
