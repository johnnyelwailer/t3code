/**
 * Per queued-message provider gate outcome. The ensure component writes; the flusher and setup
 * card read. Store-free of React so the flusher effect can re-run on updates.
 */
import type { CloudQueuedSendProviderGate } from "./t3team-cloudQueuedSendProviderGate";
import { cloudQueuedSendProviderReady } from "./t3team-cloudQueuedSendProviderGate";

export interface CloudQueuedSendProviderReadyEntry {
  readonly ready: boolean;
  readonly gate: CloudQueuedSendProviderGate;
}

const entries = new Map<string, CloudQueuedSendProviderReadyEntry>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function sameGate(a: CloudQueuedSendProviderGate, b: CloudQueuedSendProviderGate): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "failed" && b.kind === "failed") return a.message === b.message;
  if (
    (a.kind === "needsInstall" || a.kind === "needsAuth") &&
    (b.kind === "needsInstall" || b.kind === "needsAuth")
  ) {
    return a.tool === b.tool;
  }
  return true;
}

export function setCloudQueuedSendProviderReady(
  messageId: string,
  gate: CloudQueuedSendProviderGate,
): void {
  const ready = cloudQueuedSendProviderReady(gate);
  const previous = entries.get(messageId);
  if (previous !== undefined && previous.ready === ready && sameGate(previous.gate, gate)) return;
  entries.set(messageId, { ready, gate });
  emit();
}

export function clearCloudQueuedSendProviderReady(messageId: string): void {
  if (!entries.delete(messageId)) return;
  emit();
}

export function getCloudQueuedSendProviderReady(messageId: string): boolean {
  return entries.get(messageId)?.ready ?? false;
}

export function getCloudQueuedSendProviderGate(
  messageId: string,
): CloudQueuedSendProviderGate | null {
  return entries.get(messageId)?.gate ?? null;
}

export function subscribeCloudQueuedSendProviderReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam. */
export function resetCloudQueuedSendProviderReadyStore(): void {
  entries.clear();
  emit();
}
