/**
 * Composer sends from the moment they are in flight until their start-turn reply: "Sending…",
 * then "Not confirmed" with a Retry that reuses the command id. The outbox drain waits on these,
 * so a message queued meanwhile goes out after them.
 * Spec: nx-nexi nexi-work/send-confirmation.statechart/.
 */
import type { EnvironmentId } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

export type SendConfirmationStatus = "sending" | "not-confirmed";

export interface PendingSend {
  readonly threadId: string;
  readonly environmentId: EnvironmentId;
  readonly status: SendConfirmationStatus;
  /** Retry was pressed: "Sending…" shows at once instead of after the first-send delay. */
  readonly retried: boolean;
  readonly retry: (() => void) | null;
}

let pending: ReadonlyMap<string, PendingSend> = new Map();
let inFlightThreads: ReadonlySet<string> = new Set();
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

function update(next: Map<string, PendingSend>) {
  pending = next;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function patch(messageId: string, change: Partial<PendingSend>) {
  const current = pending.get(messageId);
  if (current) update(new Map(pending).set(messageId, { ...current, ...change }));
}

export function markSendPending(
  messageId: string,
  send: { readonly threadId: string; readonly environmentId: EnvironmentId },
) {
  update(
    new Map(pending).set(messageId, { ...send, status: "sending", retried: false, retry: null }),
  );
}

/** The connection did not come back: keep the message, offer Retry with the same command id. */
export function markSendNotConfirmed(messageId: string, retry: () => void) {
  patch(messageId, { status: "not-confirmed", retry });
}

export function reopenSend(messageId: string) {
  patch(messageId, { status: "sending", retried: true, retry: null });
}

export function settleSend(messageId: string) {
  if (!pending.has(messageId)) return;
  const next = new Map(pending);
  next.delete(messageId);
  update(next);
}

/** The composer's in-flight flag for a thread, from send press through prepare and dispatch. */
export function setThreadSendInFlight(threadId: string, inFlight: boolean) {
  if (inFlightThreads.has(threadId) === inFlight) return;
  const next = new Set(inFlightThreads);
  if (inFlight) next.add(threadId);
  else next.delete(threadId);
  inFlightThreads = next;
  notify();
}

export const peekSend = (messageId: string): PendingSend | undefined => pending.get(messageId);

/** True while a send of `threadId` is in flight, waits for its reply, or waits for Retry. */
export function threadHasPendingSend(threadId: string): boolean {
  if (inFlightThreads.has(threadId)) return true;
  for (const send of pending.values()) if (send.threadId === threadId) return true;
  return false;
}

/** True while a send of `threadId` is "Not confirmed". */
export function threadHasUnconfirmedSend(threadId: string): boolean {
  for (const send of pending.values()) {
    if (send.threadId === threadId && send.status === "not-confirmed") return true;
  }
  return false;
}

export function useSendConfirmation(messageId: string): PendingSend | undefined {
  return useSyncExternalStore(
    subscribe,
    () => pending.get(messageId),
    () => undefined,
  );
}

/** Changes whenever any send starts, settles or changes, so a waiting drain re-checks its head. */
export function usePendingSendsVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}

/** Wraps the composer's in-flight ref so every write also marks the thread (one seam). */
export function trackSendInFlight(
  ref: { current: boolean },
  threadId: string | null,
): { current: boolean } {
  return {
    get current() {
      return ref.current;
    },
    set current(value: boolean) {
      ref.current = value;
      if (threadId !== null) setThreadSendInFlight(threadId, value);
    },
  };
}
