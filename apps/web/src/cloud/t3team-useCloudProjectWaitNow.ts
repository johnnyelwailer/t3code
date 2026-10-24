import { useEffect, useState } from "react";

import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { nextCloudProjectWaitChangeMs } from "./t3team-cloudProjectWaitClock";

/**
 * The wall-clock time the "Project ready" wording is read at. It re-renders only when the wording
 * can change (the expected and slow points after the step's stamp), so the composer banner and the
 * setup card show the same level without a per-second tick. `frozenNowMs` pins it for stories.
 */
export function useCloudProjectWaitNow(
  queued: CloudQueuedSend | undefined,
  frozenNowMs?: number,
): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const nextMs = frozenNowMs === undefined ? nextCloudProjectWaitChangeMs(queued, nowMs) : null;
  useEffect(() => {
    if (nextMs === null) return;
    const id = setTimeout(() => setNowMs(Math.max(Date.now(), nextMs)), nextMs - Date.now());
    return () => clearTimeout(id);
  }, [nextMs]);
  return frozenNowMs ?? nowMs;
}
