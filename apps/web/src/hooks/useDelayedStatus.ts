import {
  type DelayedStatusTiming,
  delayedStatusDeadline,
  shownDelayedStatus,
  stepDelayedStatus,
} from "@t3tools/client-runtime/delayed-status";
import { useState } from "react";

import { useDeadlinePassed } from "./useDeadline";

/**
 * Returns `value` only once it has lasted past the show delay, then holds it
 * for a minimum time, so a short status never flashes. `key` is what the
 * status belongs to (for example a thread). A new key drops it at once.
 * `timing` overrides the shared show delay and hold for a slow-changing surface.
 * Mobile has the same hook.
 */
export function useDelayedStatus<A>(
  key: string,
  value: A | null,
  timing?: DelayedStatusTiming,
): A | null {
  const timingInput = timing === undefined ? {} : { timing };
  const [state, setState] = useState(() =>
    stepDelayedStatus<A>(null, { key, value, deadlinePassed: false, ...timingInput }, Date.now),
  );
  const deadlinePassed = useDeadlinePassed(delayedStatusDeadline(state));
  const next = stepDelayedStatus(state, { key, value, deadlinePassed, ...timingInput }, Date.now);
  if (next !== state) setState(next);
  return shownDelayedStatus(next, key);
}
