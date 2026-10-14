/**
 * The queued cloud sends a flusher in this window is dispatching right now ("Sending…"): the
 * in-window half of exactly-once delivery, and what makes Cancel step aside.
 */
import { useSyncExternalStore } from "react";

// Messages a flusher in this window is dispatching right now ("Sending…").
const dispatching = new Set<string>();
const listeners = new Set<() => void>();
let dispatchingSnapshot: ReadonlySet<string> = new Set();

export function setCloudQueuedSendDispatching(messageId: string, active: boolean): void {
  if (active === dispatching.has(messageId)) return;
  if (active) dispatching.add(messageId);
  else dispatching.delete(messageId);
  dispatchingSnapshot = new Set(dispatching);
  for (const listener of listeners) listener();
}

export function isCloudQueuedSendDispatching(messageId: string): boolean {
  return dispatching.has(messageId);
}

function subscribeDispatching(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCloudQueuedSendDispatching(messageId: string | null): boolean {
  const snapshot = useSyncExternalStore(
    subscribeDispatching,
    () => dispatchingSnapshot,
    () => dispatchingSnapshot,
  );
  return messageId !== null && snapshot.has(messageId);
}
