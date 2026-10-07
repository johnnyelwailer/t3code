import { useEffect, useState, type RefObject } from "react";

/**
 * Whether the element is on screen in a visible tab. The step clock stops when either is false:
 * a tour should not advance past steps nobody is looking at. (`observeVisibleAnimation` pauses
 * CSS motion the same way; this is the JS twin for timers.)
 */
export function useExplainerInView(ref: RefObject<Element | null>) {
  const [onscreen, setOnscreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (entry) setOnscreen(entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return onscreen && pageVisible;
}
