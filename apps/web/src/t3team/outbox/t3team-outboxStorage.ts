/**
 * Durable storage for the t3team outbox: one localStorage record per entry,
 * keyed by entry id. Survives reload and app restarts, so queued sends are
 * still delivered after the page comes back.
 */
import {
  decodeT3TeamOutboxEntry,
  type T3TeamOutboxEntry,
} from "~/t3team/outbox/t3team-outboxModel";

const OUTBOX_STORAGE_PREFIX = "t3team-outbox:v1:";

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
