import {
  createDelayedStatus,
  type DelayedStatusTiming,
  type ShownStatus,
} from "@t3tools/client-runtime/delayed-status";
import { useEffect, useState } from "react";

/**
 * Returns `value` only once it has lasted past the show delay, then holds it for a minimum time, so
 * a short status never flashes. `key` is what the status belongs to (for example a thread); a new
 * key drops it at once. `timing` is read once, when the hook mounts. Mobile has the same hook.
 */
export function useDelayedStatus<A>(
  key: string,
  value: A | null,
  timing?: DelayedStatusTiming,
): A | null {
  const [shown, setShown] = useState<ShownStatus<A> | null>(null);
  const [status] = useState(() => createDelayedStatus<A>(setShown, timing));
  useEffect(() => () => status.dispose(), [status]);
  useEffect(() => {
    status.update(key, value);
  }, [status, key, value]);
  return shown?.key === key ? shown.value : null;
}
