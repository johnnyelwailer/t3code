import * as Schema from "effect/Schema";
import { getLocalStorageItem, setLocalStorageItem } from "~/t3work/hooks/t3work-useLocalStorage";

export type ResizableRightSidebarDragState = {
  currentWidth: number;
  pointerId: number;
  startX: number;
  startWidth: number;
  handle: HTMLButtonElement;
};

export function clampRightSidebarWidth(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function readStoredRightSidebarCollapsedState(storageKey: string): boolean {
  try {
    const stored = getLocalStorageItem(storageKey, Schema.Boolean);
    return stored ?? false;
  } catch {
    if (typeof window === "undefined") {
      return false;
    }

    const legacyValue = window.localStorage.getItem(storageKey);
    if (legacyValue === "1") {
      setLocalStorageItem(storageKey, true, Schema.Boolean);
      return true;
    }
    if (legacyValue === "0") {
      setLocalStorageItem(storageKey, false, Schema.Boolean);
      return false;
    }
    return false;
  }
}
