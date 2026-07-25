import { useCallback, useEffect, useRef, useState } from "react";

export type WorkItemLayoutMode = "narrow" | "regular" | "wide" | "ultra";

/**
 * Breakpoints in pixels, matching the container-query steps used for styling in
 * `t3team-WorkItemDetailLayout.tsx` (`@2xl` = 42rem, `@4xl` = 56rem, 90rem for the split).
 */
const WIDE_PX = 56 * 16;
const REGULAR_PX = 42 * 16;
const ULTRA_PX = 90 * 16;

function modeForWidth(width: number): WorkItemLayoutMode {
  if (width >= ULTRA_PX) return "ultra";
  if (width >= WIDE_PX) return "wide";
  if (width >= REGULAR_PX) return "regular";
  return "narrow";
}

/**
 * Observes the detail view's own width and reports which layout applies.
 *
 * Styling is handled by CSS container queries, which need no JavaScript. This hook exists for the
 * decisions CSS cannot make — where a node lives in the tree, and whether a section starts
 * collapsed. Those have to be structural: rendering both arrangements and hiding one with
 * `display:none` would mount every interactive control twice, giving duplicate element ids and two
 * copies of the state behind each popover.
 *
 * It measures the element rather than the viewport for the same reason the styling does: this view
 * sits in a resizable pane, so the window size says nothing useful about the space available.
 */
export function useWorkItemLayoutMode(): {
  readonly mode: WorkItemLayoutMode;
  readonly containerRef: (node: HTMLElement | null) => void;
} {
  const [mode, setMode] = useState<WorkItemLayoutMode>("wide");
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    },
    [],
  );

  const containerRef = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!node) return;

    // Seed synchronously so the first paint uses the real width instead of the default.
    setMode(modeForWidth(node.getBoundingClientRect().width));

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined && width > 0) {
        setMode(modeForWidth(width));
      }
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  return { mode, containerRef };
}
