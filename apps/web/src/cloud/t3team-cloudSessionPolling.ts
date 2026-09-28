import type { CloudSession } from "@t3tools/contracts";
import { useEffect } from "react";

import { isCloudSessionProvisionPending } from "~/components/cloud/t3team-cloudSessionProvisionPresentation";

/**
 * Polling the cloud session list while a surface that shows it is active.
 *
 * The list atom carries no refresh interval of its own (owner decision: be
 * conservative with GHE calls — every list costs a GHE runs call), so the
 * cadence that keeps a provisioning session's phases ticking forward lives on
 * the surface that is actually showing it. While `active` and the window is
 * visible, the list is pulled once immediately — a menu must not open on data
 * that is seconds old — and then on the interval until the surface goes away.
 * A hidden window polls nothing and refreshes once when it comes back.
 */

/** Floor between two list refreshes, across every surface and trigger. */
export const CLOUD_SESSION_MIN_REFRESH_GAP_MS = 5_000;

/**
 * Cadence while nothing is provisioning. Only a pending session changes phase
 * every few seconds; a list of ready or finished sessions moves on the scale of
 * minutes, so polling it at the busy cadence just spends GHE calls.
 */
export const CLOUD_SESSION_IDLE_REFRESH_INTERVAL_MS = 30_000;

/**
 * The poll interval for a session list: the busy cadence (never below the
 * shared floor) while any session is still provisioning, the idle one otherwise.
 */
export function cloudSessionPollIntervalMs(
  sessions: readonly Pick<CloudSession, "phase">[],
  busyIntervalMs: number,
): number {
  const busy = sessions.some((session) => isCloudSessionProvisionPending(session.phase));
  return busy
    ? Math.max(busyIntervalMs, CLOUD_SESSION_MIN_REFRESH_GAP_MS)
    : CLOUD_SESSION_IDLE_REFRESH_INTERVAL_MS;
}

/** Whether the window is hidden, and a way to hear when that changes. */
export interface CloudSessionPollingVisibility {
  readonly isHidden: () => boolean;
  readonly subscribe: (onChange: () => void) => () => void;
}

const documentVisibility = (): CloudSessionPollingVisibility =>
  typeof document === "undefined"
    ? { isHidden: () => false, subscribe: () => () => {} }
    : {
        isHidden: () => document.visibilityState === "hidden",
        subscribe: (onChange) => {
          document.addEventListener("visibilitychange", onChange);
          return () => document.removeEventListener("visibilitychange", onChange);
        },
      };

/**
 * A per-key minimum gap: `acquire(key)` is true (and starts a new gap) only
 * when at least `minGapMs` passed since the last successful acquire.
 */
export function createRefreshGate(minGapMs: number, now: () => number = () => Date.now()) {
  const lastAt = new Map<string, number>();
  return (key: string): boolean => {
    const at = now();
    const previous = lastAt.get(key);
    if (previous !== undefined && at - previous < minGapMs) return false;
    lastAt.set(key, at);
    return true;
  };
}

/**
 * Module-level on purpose: the settings panel and the "Run on" menu each run a
 * controller, and the floor must hold for the list they share, not per surface.
 */
export const acquireCloudSessionListRefresh = createRefreshGate(CLOUD_SESSION_MIN_REFRESH_GAP_MS);

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
 * Runs `refresh` immediately and then every `intervalMs` until cleaned up,
 * pausing while the window is hidden. Chained timeouts rather than an interval,
 * so a slow tick delays the next one instead of bunching them.
 */
export function startCloudSessionListPolling(
  refresh: () => void,
  intervalMs: number,
  visibility: CloudSessionPollingVisibility = documentVisibility(),
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const tick = () => {
    timer = null;
    if (stopped || visibility.isHidden()) return;
    refresh();
    timer = setTimeout(tick, intervalMs);
  };
  const unsubscribe = visibility.subscribe(() => {
    if (stopped) return;
    if (visibility.isHidden()) clear();
    else if (timer === null) tick();
  });
  tick();
  return () => {
    stopped = true;
    clear();
    unsubscribe();
  };
}
