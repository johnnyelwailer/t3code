import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import { observeResize } from "~/lib/observeResize";

/** Width of the pill row the ref is attached to, null before the first read; `clientWidth` is
 * the space its children share (no padding or borders). Read in a layout effect so the first
 * paint already lays the pills out; `observeResize` keeps it honest while the sidebar resizes.
 */
export function useSidebarPillRowWidth(): [RefObject<HTMLDivElement | null>, number | null] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures the row DOM node before paint and tracks its resizes
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    return observeResize(node, () => measure());
  }, []);
  return [ref, width];
}
