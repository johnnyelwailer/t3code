import { useEffect, useRef, useState } from "react";

export interface TransitioningFace<K extends string> {
  readonly key: K;
  readonly phase: "enter" | "exit";
}

/**
 * The face to show, and the face that just left while it fades out. A face that leaves stays
 * for `exitMs`, which is what lets two faces cross-fade instead of cutting.
 */
export function useFaceTransition<K extends string>(
  key: K,
  exitMs = 220,
): ReadonlyArray<TransitioningFace<K>> {
  const [leaving, setLeaving] = useState<K | null>(null);
  const previous = useRef(key);

  useEffect(() => {
    if (previous.current === key) return;
    setLeaving(previous.current);
    previous.current = key;
    const timer = window.setTimeout(() => setLeaving(null), exitMs);
    return () => window.clearTimeout(timer);
  }, [key, exitMs]);

  return leaving === null || leaving === key
    ? [{ key, phase: "enter" }]
    : [
        { key: leaving, phase: "exit" },
        { key, phase: "enter" },
      ];
}
