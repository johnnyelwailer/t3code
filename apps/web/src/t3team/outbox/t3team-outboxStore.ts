/**
 * In-memory state of the t3team outbox, mirrored into localStorage for
 * durability. A module-level store (not a React store): the drain hook and
 * the enqueue paths both live across component trees, and the dispatch lock
 * must be global so two mounted thread views never double-send one entry.
 */
import { useEffect, useSyncExternalStore } from "react";

import {
  groupT3TeamOutboxEntriesByEnvironment,
  t3TeamOutboxRetryDelayMs,
  type T3TeamOutboxEntry,
} from "~/t3team/outbox/t3team-outboxModel";
import {
  loadStoredOutboxEntries,
  persistOutboxEntry,
  removeStoredOutboxEntry,
  releaseOutboxDispatch,
  clearOutboxAttempt,
} from "~/t3team/outbox/t3team-outboxStorage";

export interface T3TeamOutboxSnapshot {
  /** Every queued entry, FIFO within each environment. */
  readonly entries: ReadonlyArray<T3TeamOutboxEntry>;
  /** The entry a drain is dispatching right now, or null. */
  readonly dispatchingEntryId: string | null;
  /** entryId -> millis until which a failed dispatch's retry must wait. */
  readonly retryNotBefore: Readonly<Record<string, number>>;
  /** entryId -> last permanent failure text, for the queued-send timeline row. */
  readonly failures: Readonly<Record<string, string>>;
  /** Bumped to wake subscribers after a backoff timer fires. */
  readonly tick: number;
}

interface MutableState {
  entries: T3TeamOutboxEntry[];
  dispatchingEntryId: string | null;
  retryNotBefore: Record<string, number>;
  failures: Record<string, string>;
  tick: number;
}

const listeners = new Set<() => void>();
let state: MutableState = {
  entries: [],
  dispatchingEntryId: null,
  retryNotBefore: {},
  failures: {},
  tick: 0,
};
/** entryId -> how many backoff retries have been scheduled for it. */
let retryAttempts: Record<string, number> = {};
let hydrated = false;

function snapshotOf(source: MutableState): T3TeamOutboxSnapshot {
  return {
    entries: source.entries,
    dispatchingEntryId: source.dispatchingEntryId,
    retryNotBefore: source.retryNotBefore,
    failures: source.failures,
    tick: source.tick,
  };
}

let currentSnapshot = snapshotOf(state);

function commit(next: Partial<MutableState>): void {
  state = { ...state, ...next };
  currentSnapshot = snapshotOf(state);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): T3TeamOutboxSnapshot {
  return currentSnapshot;
}

/** Merges durable entries into memory once per page lifetime. */
export function hydrateT3TeamOutboxStore(): void {
  if (hydrated) return;
  hydrated = true;
  const persisted = loadStoredOutboxEntries();
  if (persisted.length === 0 && state.entries.length === 0) return;
  const known = new Set(state.entries.map((entry) => entry.entryId));
  const merged = [...state.entries, ...persisted.filter((entry) => !known.has(entry.entryId))];
  commit({ entries: Object.values(groupT3TeamOutboxEntriesByEnvironment(merged)).flat() });
}

export function subscribeT3TeamOutboxStore(listener: () => void): () => void {
  return subscribe(listener);
}

/** Non-React snapshot accessor for imperative drain code. */
export function getT3TeamOutboxSnapshot(): T3TeamOutboxSnapshot {
  return currentSnapshot;
}

export function useT3TeamOutboxStore(): T3TeamOutboxSnapshot {
  useEffect(() => {
    hydrateT3TeamOutboxStore();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function getT3TeamOutboxEntriesForEnvironment(environmentId: string): T3TeamOutboxEntry[] {
  return groupT3TeamOutboxEntriesByEnvironment(currentSnapshot.entries)[environmentId] ?? [];
}

/** Enqueues (or, for a same-id retry, replaces) an entry and persists it.
 *  Returns false when the entry could not be durably stored, so the caller
 *  knows the send is NOT queued and should not clear the composer. */
export function enqueueT3TeamOutboxEntry(entry: T3TeamOutboxEntry): boolean {
  if (!persistOutboxEntry(entry)) return false;
  const withoutDuplicate = state.entries.filter((candidate) => candidate.entryId !== entry.entryId);
  const merged = [...withoutDuplicate, entry];
  delete retryAttempts[entry.entryId];
  commit({
    entries: Object.values(groupT3TeamOutboxEntriesByEnvironment(merged)).flat(),
    retryNotBefore: clearEntryState(state.retryNotBefore, entry.entryId),
    failures: clearEntryState(state.failures, entry.entryId),
  });
  return true;
}

/** Removes an entry (delivered or discarded) from memory and storage. */
export function removeT3TeamOutboxEntry(entry: T3TeamOutboxEntry): void {
  if (!state.entries.some((candidate) => candidate.entryId === entry.entryId)) return;
  removeStoredOutboxEntry(entry);
  releaseOutboxDispatch(entry.entryId);
  clearOutboxAttempt(entry.entryId);
  delete retryAttempts[entry.entryId];
  // The in-memory dispatch lock is owned by the drain's .finally, not the
  // removal: discarding the in-flight head must not release the lock and let a
  // second entry dispatch concurrently with the still-running first.
  commit({
    entries: state.entries.filter((candidate) => candidate.entryId !== entry.entryId),
    retryNotBefore: clearEntryState(state.retryNotBefore, entry.entryId),
    failures: clearEntryState(state.failures, entry.entryId),
  });
}

/** Global dispatch lock; false when another drain already owns a dispatch. */
export function acquireT3TeamOutboxDispatch(entryId: string): boolean {
  if (state.dispatchingEntryId !== null) return false;
  commit({ dispatchingEntryId: entryId });
  return true;
}

export function releaseT3TeamOutboxDispatch(): void {
  if (state.dispatchingEntryId === null) return;
  commit({ dispatchingEntryId: null });
}

/**
 * Records a failed dispatch and schedules the backoff retry. The delay grows
 * per entry (1s, 2s, ... 16s, mirroring the mobile outbox); the timer bumps
 * the tick so the drain effect re-runs once the delay elapses.
 */
export function recordT3TeamOutboxRetry(entryId: string): void {
  if (state.retryNotBefore[entryId] !== undefined) return;
  const attempt = (retryAttempts[entryId] ?? 0) + 1;
  retryAttempts = { ...retryAttempts, [entryId]: attempt };
  const delayMs = t3TeamOutboxRetryDelayMs(attempt);
  commit({
    retryNotBefore: { ...state.retryNotBefore, [entryId]: Date.now() + delayMs },
  });
  globalThis.setTimeout(() => {
    if (state.retryNotBefore[entryId] === undefined) return;
    commit({
      retryNotBefore: clearEntryState(state.retryNotBefore, entryId),
      tick: state.tick + 1,
    });
  }, delayMs);
}

/** Records a permanent failure so the banner can surface it. */
export function recordT3TeamOutboxFailure(entryId: string, error: string): void {
  commit({
    failures:
      state.failures[entryId] === error ? state.failures : { ...state.failures, [entryId]: error },
    tick: state.tick + 1,
  });
}

/** User-initiated resend of a failed entry: clears backoff and re-triggers the drain. */
export function retryT3TeamOutboxEntry(entryId: string): void {
  delete retryAttempts[entryId];
  // Clear the durable at-most-once shield too, so a resend is not blocked by a
  // stale attempt timestamp no matter how the Resend affordance surfaced.
  clearOutboxAttempt(entryId);
  commit({
    failures: clearEntryState(state.failures, entryId),
    retryNotBefore: clearEntryState(state.retryNotBefore, entryId),
    tick: state.tick + 1,
  });
}

function clearEntryState<T>(values: Record<string, T>, entryId: string): Record<string, T> {
  if (values[entryId] === undefined) return values;
  const next = { ...values };
  delete next[entryId];
  return next;
}

/** Test-only: clears all queue state so cases start from a clean store. */
export function resetT3TeamOutboxStoreForTests(): void {
  state = {
    entries: [],
    dispatchingEntryId: null,
    retryNotBefore: {},
    failures: {},
    tick: 0,
  };
  retryAttempts = {};
  hydrated = false;
  currentSnapshot = snapshotOf(state);
}
