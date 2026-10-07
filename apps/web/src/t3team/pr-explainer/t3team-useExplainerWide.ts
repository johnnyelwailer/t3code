import { useLayoutEffect, useState, type RefObject } from "react";

/** The player's width, in px, from which the step rail stands up on the left. */
export const EXPLAINER_WIDE_PX = 896;

/**
 * Whether the element itself (not the window) is at least `EXPLAINER_WIDE_PX` wide. The rail
 * swaps its markup for a vertical list, so this is measured instead of done in CSS alone.
 */
export function useExplainerWide(ref: RefObject<Element | null>) {
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = (width: number) => setWide(width >= EXPLAINER_WIDE_PX);
    measure(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(-1);
      if (entry) measure(entry.contentRect.width + paddingOf(element));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return wide;
}

/** `contentRect` excludes padding; the breakpoint is measured on the border box like the first read. */
function paddingOf(element: Element) {
  const style = getComputedStyle(element);
  return (
    Number.parseFloat(style.paddingLeft) +
    Number.parseFloat(style.paddingRight) +
    Number.parseFloat(style.borderLeftWidth) +
    Number.parseFloat(style.borderRightWidth)
  );
}
