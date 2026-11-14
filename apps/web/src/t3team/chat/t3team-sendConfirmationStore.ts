/**
 * Sends awaiting their start-turn reply: "Sending…", then "Not confirmed" with a Retry that reuses
 * the command id. The outbox drain waits on these, so queued messages go out in order.
 * Spec: nx-nexi nexi-work/send-confirmation.statechart/.
 */
import { useSyncExternalStore } from "react";

export type SendConfirmationStatus = "sending" | "not-confirmed";

interface PendingSend {
  readonly threadId: string;
  readonly environmentId: string;
  readonly status: SendConfirmationStatus;
  readonly retry: (() => void) | null;
}

let pending: ReadonlyMap<string, PendingSend> = new Map();
const listeners = new Set<() => void>();

function update(next: Map<string, PendingSend>) {
  pending = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markSendPending(
  messageId: string,
  send: { readonly threadId: string; readonly environmentId: string },
) {
  update(new Map(pending).set(messageId, { ...send, status: "sending", retry: null }));
}

/** The reply never came: keep the message, offer Retry with the same command id. */
export function markSendNotConfirmed(messageId: string, retry: () => void) {
  const current = pending.get(messageId);
  if (!current) return;
  update(new Map(pending).set(messageId, { ...current, status: "not-confirmed", retry }));
}

/** Retry pressed: the message is "Sending…" again while the same request goes out. */
export function reopenSend(messageId: string) {
  const current = pending.get(messageId);
  if (!current) return;
  update(new Map(pending).set(messageId, { ...current, status: "sending", retry: null }));
}

export function settleSend(messageId: string) {
  if (!pending.has(messageId)) return;
  const next = new Map(pending);
  next.delete(messageId);
  update(next);
}

export const peekSend = (messageId: string): PendingSend | undefined => pending.get(messageId);

/** True while a message of `threadId` waits for its reply or for Retry. */
export function threadHasPendingSend(threadId: string): boolean {
  for (const send of pending.values()) if (send.threadId === threadId) return true;
  return false;
}

export function useSendConfirmation(messageId: string): PendingSend | undefined {
  return useSyncExternalStore(
    subscribe,
    () => pending.get(messageId),
    () => undefined,
  );
}

/** Re-renders whenever any send settles, so a waiting outbox drain re-checks the head entry. */
export function usePendingSendsVersion(): ReadonlyMap<string, PendingSend> {
  return useSyncExternalStore(
    subscribe,
    () => pending,
    () => pending,
  );
}
