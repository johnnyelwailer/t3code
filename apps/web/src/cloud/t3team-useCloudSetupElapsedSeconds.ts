/**
 * The setup card's clock: seconds since dispatch right now, ticking once a second in whichever
 * component calls it (so only that leaf re-renders). Not derived from `Date.now() - startedAt`,
 * which would trust the client's wall clock; it is the server's own figure from the last poll plus
 * the time since that poll arrived.
 */
import { useEffect, useState } from "react";

import { cloudSetupElapsedSeconds } from "./t3team-cloudSessionSetupProgress";

const TICK_MS = 1_000;

/**
 * Seconds since dispatch right now: the server's figure from the last poll plus the time since it
 * arrived. A later poll re-anchors only forwards, so the clock never runs backwards on a slow poll.
 */
export function useCloudSetupElapsedSeconds(
  snapshotElapsedSeconds: number,
  active: boolean,
  frozen: number | undefined,
): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clock, setClock] = useState(() => ({
    base: snapshotElapsedSeconds,
    atMs: nowMs,
    source: snapshotElapsedSeconds,
  }));
  useEffect(() => {
    if (!active || frozen !== undefined) return;
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [active, frozen]);
  if (clock.source !== snapshotElapsedSeconds) {
    const local = cloudSetupElapsedSeconds(clock.base, clock.atMs, nowMs);
    setClock({
      base: Math.max(snapshotElapsedSeconds, local),
      atMs: nowMs,
      source: snapshotElapsedSeconds,
    });
  }
  if (frozen !== undefined) return frozen;
  return cloudSetupElapsedSeconds(clock.base, clock.atMs, nowMs);
}
