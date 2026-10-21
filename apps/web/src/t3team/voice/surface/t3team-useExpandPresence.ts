import { useEffect, useState } from "react";

/**
 * Mount while open and for `exitMs` after closing, so a collapse can play. `expanded` flips one
 * frame after mounting, which is what lets a CSS transition run from the collapsed state.
 */
export function useExpandPresence(open: boolean, exitMs = 420) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted, expanded };
}
