import { useSyncExternalStore } from "react";

/**
 * Per-viewer update notice memory, shared live by every surface that reads it. Storage can be
 * blocked; this session then keeps the values in memory, and a new session shows a notice again.
 */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export const readKey = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
};

export const writeKey = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
  for (const listener of listeners) listener();
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** A stored notice value that re-renders its reader whenever any surface or window writes it. */
export function useStoredKey(key: string): string | null {
  return useSyncExternalStore(subscribe, () => readKey(key));
}
