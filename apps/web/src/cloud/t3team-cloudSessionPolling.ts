import { useEffect } from "react";

/**
 * Polling the cloud session list while a surface that shows it is active.
 *
 * The list atom carries no refresh interval of its own (owner decision: be
 * conservative with GHE calls), so the 5-second cadence that keeps a
 * provisioning session's phases ticking forward lives on the surface that is
 * actually showing it. While `active`, the list is pulled once immediately —
 * a menu must not open on data that is seconds old — and then on the interval
 * until the surface goes away.
 */
export function useCloudSessionListPolling(
  refresh: () => void,
  active: boolean,
  intervalMs: number,
): void {
  useEffect(() => {
    if (!active) return;
    return startCloudSessionListPolling(refresh, intervalMs);
  }, [refresh, active, intervalMs]);
}

/**
 * Runs `refresh` immediately and then on a fixed interval until cleaned up.
 */
export function startCloudSessionListPolling(refresh: () => void, intervalMs: number): () => void {
  refresh();
  const timer = setInterval(() => refresh(), intervalMs);
  return () => {
    clearInterval(timer);
  };
}
