/**
 * The just-created cloud session that the server list may not carry yet.
 * Module-level so every Run-on / Settings controller shares one record: a create
 * must not vanish when the composer remounts or the user opens another thread.
 */
import { useSyncExternalStore } from "react";

import type { LocalCloudSession } from "~/components/cloud/t3team-cloudSessionSplit";

const listeners = new Set<() => void>();
let localSession: LocalCloudSession | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

export function getCloudSessionLocal(): LocalCloudSession | null {
  return localSession;
}

export function setCloudSessionLocal(next: LocalCloudSession | null): void {
  if (localSession === next) return;
  localSession = next;
  emit();
}

export function subscribeCloudSessionLocal(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCloudSessionLocal(): LocalCloudSession | null {
  return useSyncExternalStore(
    subscribeCloudSessionLocal,
    getCloudSessionLocal,
    getCloudSessionLocal,
  );
}
