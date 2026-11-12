/**
 * Visible click reaction in one frame, then pending, or an inline error with one Retry.
 * A second click while pending is ignored.
 */
import { useRef, useState } from "react";

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

  function run(fn: () => void | Promise<void>) {
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
  }

  function clear() {
    pendingRef.current = false;
    setPending(false);
    setError(false);
  }

  return { pending, error, run, clear };
}

export { optimisticActionLabel } from "./t3team-cloudSessionOptimisticLabel";
