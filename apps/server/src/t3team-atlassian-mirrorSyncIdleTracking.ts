/**
 * Idle-kick tracking for the Atlassian mirror sync background loops (see
 * t3team-atlassian-backlog-mirrorSyncService.ts). Split into its own module
 * to keep that already-large file from growing further.
 */
import * as DateTime from "effect/DateTime";

/**
 * Idle TTL: a loop self-terminates once no kick has been seen for this long.
 * My Work polling re-kicks (~4 s) while its view is open, so an actively
 * viewed project stays alive; closing the view lets its loop wind down
 * instead of polling Jira forever in the background.
 */
const idleTtlMs = 30 * 60 * 1_000; // 30 minutes

/** Last time (epoch ms) a kick was seen for each (provider|account|project) key. */
const lastKickedMsByKey = new Map<string, number>();

/** Record that a kick was just seen for this mirror sync key. */
export function recordT3TeamMirrorSyncKick(mapKey: string): void {
  lastKickedMsByKey.set(mapKey, DateTime.nowUnsafe().epochMilliseconds);
}

/** The last-kicked timestamp for a key, or `undefined` if never kicked. */
export function lastT3TeamMirrorSyncKickMs(mapKey: string): number | undefined {
  return lastKickedMsByKey.get(mapKey);
}

/** Forget all kick history (e.g. when every active loop is being stopped). */
export function clearT3TeamMirrorSyncKickHistory(): void {
  lastKickedMsByKey.clear();
}

/**
 * Pure predicate: has this (provider|account|project) gone idle (no kick
 * within the TTL)? Exported for direct unit testing without needing to drive
 * the detached loop fiber itself.
 */
export function isT3TeamMirrorSyncIdle(input: {
  readonly nowMs: number;
  readonly lastKickedMs: number;
}): boolean {
  return input.nowMs - input.lastKickedMs >= idleTtlMs;
}
