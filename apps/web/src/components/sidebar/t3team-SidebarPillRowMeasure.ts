import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import { observeResize } from "~/lib/observeResize";

/**
 * The width of the pill row the ref is attached to, or null before the first read. The row
 * carries no padding or borders, so `clientWidth` is exactly the space its children share.
 * The first read happens in a layout effect, so the very first paint already lays the pills
 * out instead of flashing them; `observeResize` keeps the width honest while the sidebar
 * resizes.
 */
export function useSidebarPillRowWidth(): [RefObject<HTMLDivElement | null>, number | null] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    return observeResize(node, () => measure());
  }, []);
  return [ref, width];
}
