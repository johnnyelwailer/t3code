/**
 * A visible reaction to a click within one frame (well under 100 ms), then
 * pending until the parent shows progress, or an inline error with one Retry.
 * A second click while pending is ignored (double-click / duplicate send).
 */
import { useCallback, useRef, useState } from "react";

export interface CloudSessionOptimisticAction {
  readonly pending: boolean;
  readonly error: boolean;
  readonly run: (fn: () => void | Promise<void>) => void;
  readonly clear: () => void;
}

export function useCloudSessionOptimisticAction(): CloudSessionOptimisticAction {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const pendingRef = useRef(false);

  const run = useCallback((fn: () => void | Promise<void>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setError(false);
    setPending(true);
    try {
      const result = fn();
      if (result != null && typeof (result as Promise<void>).then === "function") {
        void (result as Promise<void>).catch(() => {
          pendingRef.current = false;
          setError(true);
          setPending(false);
        });
      }
    } catch {
      pendingRef.current = false;
      setError(true);
      setPending(false);
    }
  }, []);

  const clear = useCallback(() => {
    pendingRef.current = false;
    setPending(false);
    setError(false);
  }, []);

  return { pending, error, run, clear };
}

export { optimisticActionLabel } from "./t3team-cloudSessionOptimisticLabel";
