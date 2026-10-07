import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import * as Schema from "effect/Schema";
import { getLocalStorageItem, setLocalStorageItem } from "~/t3team/hooks/t3team-useLocalStorage";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";

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

export function readStoredRightSidebarCollapsedState(
  storageKey: string,
  defaultCollapsed = false,
): boolean {
  try {
    const stored = getLocalStorageItem(storageKey, Schema.Boolean);
    return stored ?? defaultCollapsed;
  } catch {
    if (typeof window === "undefined") {
      return defaultCollapsed;
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
    return defaultCollapsed;
  }
}

/** The aside's width and collapsed flag, restored from local storage and written back on change. */
export function useStoredRightSidebarState(input: {
  readonly widthStorageKey: string;
  readonly collapsedStorageKey: string;
  readonly defaultAsideWidth: number;
  /** Collapsed until the user opens it once; afterwards their choice is stored. */
  readonly defaultCollapsed?: boolean;
}) {
  const { widthStorageKey, collapsedStorageKey, defaultAsideWidth, defaultCollapsed } = input;
  const [asideWidth, setAsideWidth] = useState(defaultAsideWidth);
  // Read on the first render, not in the effect: a collapsed aside must not flash open on mount.
  const [isCollapsed, setIsCollapsed] = useState(() =>
    readStoredRightSidebarCollapsedState(collapsedStorageKey, defaultCollapsed),
  );
  useEffect(() => {
    const storedWidth = getLocalStorageItem(widthStorageKey, Schema.Finite);
    if (storedWidth !== null) {
      setAsideWidth(storedWidth);
    }
    setIsCollapsed(readStoredRightSidebarCollapsedState(collapsedStorageKey, defaultCollapsed));
  }, [collapsedStorageKey, defaultCollapsed, widthStorageKey]);
  const setCollapsedState = useCallback(
    (nextCollapsed: boolean) => {
      runT3TeamViewTransition(() => {
        setIsCollapsed(nextCollapsed);
        setLocalStorageItem(collapsedStorageKey, nextCollapsed, Schema.Boolean);
      });
    },
    [collapsedStorageKey],
  );
  return { asideWidth, setAsideWidth, isCollapsed, setCollapsedState };
}

/**
 * Whether the element is at least `minWidth` wide. The PANE's width, not the viewport's: the left
 * sidebar and the window size both eat into it, so a 1024px window can leave a 768px pane.
 */
export function useElementFitsWidth(minWidth: number) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    if (!node) return;
    // Measure on attach, before paint: a narrow pane must not flash the split for one frame.
    setFits(node.getBoundingClientRect().width >= minWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setFits(entry.contentRect.width >= minWidth);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [minWidth, node]);
  return { ref: setNode, fits };
}
