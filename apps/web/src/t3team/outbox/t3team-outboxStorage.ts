/**
 * Durable storage for the t3team outbox: one localStorage record per entry,
 * keyed by entry id. Survives reload and app restarts, so queued sends are
 * still delivered after the page comes back.
 */
import {
  OUTBOX_CLAIM_TTL_MS,
  decodeT3TeamOutboxEntry,
  type T3TeamOutboxEntry,
} from "~/t3team/outbox/t3team-outboxModel";
import { randomUUID } from "~/lib/utils";

const OUTBOX_STORAGE_PREFIX = "t3team-outbox:v1:";
const OUTBOX_CLAIM_PREFIX = "t3team-outbox:claim:v1:";
const OUTBOX_ATTEMPT_PREFIX = "t3team-outbox:attempt:v1:";

/** Stable per-tab identity, so a claim can distinguish "this tab" from others. */
const DISPATCH_TAB_ID = randomUUID();

export function outboxStorageAvailable(): boolean {
  try {
    return typeof globalThis.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function storage(): Storage {
  return globalThis.localStorage;
}

/** All readable entries; unreadable records are dropped (they cannot drain). */
export function loadStoredOutboxEntries(): T3TeamOutboxEntry[] {
  const entries: T3TeamOutboxEntry[] = [];
  try {
    const seen = new Set<string>();
    for (let index = 0; index < storage().length; index += 1) {
      const key = storage().key(index);
      if (key === null || !key.startsWith(OUTBOX_STORAGE_PREFIX)) continue;
      const raw = storage().getItem(key);
      if (raw === null) continue;
      let entry: T3TeamOutboxEntry | null;
      try {
        entry = decodeT3TeamOutboxEntry(JSON.parse(raw));
      } catch {
        entry = null;
      }
      if (entry !== null && !seen.has(entry.entryId)) {
        seen.add(entry.entryId);
        entries.push(entry);
      } else {
        storage().removeItem(key);
      }
    }
  } catch (error) {
    console.warn("[t3team-outbox] failed to load persisted entries", error);
  }
  return entries;
}

export function persistOutboxEntry(entry: T3TeamOutboxEntry): boolean {
  try {
    storage().setItem(OUTBOX_STORAGE_PREFIX + entry.entryId, JSON.stringify(entry));
    return true;
  } catch (error) {
    console.warn("[t3team-outbox] failed to persist entry", error);
    return false;
  }
}

export function removeStoredOutboxEntry(entry: T3TeamOutboxEntry): void {
  try {
    storage().removeItem(OUTBOX_STORAGE_PREFIX + entry.entryId);
  } catch (error) {
    console.warn("[t3team-outbox] failed to remove persisted entry", error);
  }
}

/**
 * Whether the entry still has a durable record. Once another tab delivers or
 * discards it, the record is gone and this tab can drop its stale in-memory
 * copy instead of re-dispatching something that no longer exists.
 */
export function storedOutboxEntryExists(entryId: string): boolean {
  try {
    return storage().getItem(OUTBOX_STORAGE_PREFIX + entryId) !== null;
  } catch {
    return false;
  }
}

function readOutboxDispatchClaim(entryId: string): { ts: number; owner: string } | null {
  try {
    const raw = storage().getItem(OUTBOX_CLAIM_PREFIX + entryId);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { ts?: unknown; owner?: unknown };
    return typeof parsed.ts === "number" && typeof parsed.owner === "string"
      ? { ts: parsed.ts, owner: parsed.owner }
      : null;
  } catch {
    return null;
  }
}

/**
 * Cross-tab dispatch claim: only one tab dispatches a given entry within the
 * claim window. A fresh claim owned by *another* tab makes this a no-op, so
 * two tabs on the same thread cannot both fire the head entry on reconnect.
 * Fails open (returns true) when storage is unavailable so a storage outage
 * never wedges the queue.
 */
export function acquireOutboxDispatch(entryId: string): boolean {
  try {
    const existing = readOutboxDispatchClaim(entryId);
    if (
      existing !== null &&
      existing.owner !== DISPATCH_TAB_ID &&
      Date.now() - existing.ts < OUTBOX_CLAIM_TTL_MS
    ) {
      return false;
    }
    storage().setItem(
      OUTBOX_CLAIM_PREFIX + entryId,
      JSON.stringify({ ts: Date.now(), owner: DISPATCH_TAB_ID }),
    );
    return true;
  } catch (error) {
    console.warn("[t3team-outbox] failed to acquire dispatch claim", error);
    return true;
  }
}

/** Drops the entry's claim (only when this tab owns it, or it is already gone). */
export function releaseOutboxDispatch(entryId: string): void {
  try {
    const existing = readOutboxDispatchClaim(entryId);
    if (existing === null || existing.owner === DISPATCH_TAB_ID) {
      storage().removeItem(OUTBOX_CLAIM_PREFIX + entryId);
    }
  } catch (error) {
    console.warn("[t3team-outbox] failed to release dispatch claim", error);
  }
}

/** Epoch ms the entry's send was last attempted, or null when never attempted. */
export function getOutboxAttemptTs(entryId: string): number | null {
  try {
    const raw = storage().getItem(OUTBOX_ATTEMPT_PREFIX + entryId);
    if (raw === null) return null;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

export function setOutboxAttempt(entryId: string): void {
  try {
    storage().setItem(OUTBOX_ATTEMPT_PREFIX + entryId, String(Date.now()));
  } catch (error) {
    console.warn("[t3team-outbox] failed to record dispatch attempt", error);
  }
}

export function clearOutboxAttempt(entryId: string): void {
  try {
    storage().removeItem(OUTBOX_ATTEMPT_PREFIX + entryId);
  } catch (error) {
    console.warn("[t3team-outbox] failed to clear dispatch attempt", error);
  }
}
