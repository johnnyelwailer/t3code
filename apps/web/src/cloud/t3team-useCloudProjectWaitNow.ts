import { useEffect, useState } from "react";

import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { nextCloudProjectWaitChangeMs } from "./t3team-cloudProjectWaitClock";
import {
  currentCloudProjectWait,
  type CloudQueuedSendStepFacts,
} from "./t3team-cloudQueuedSendSteps";

/**
 * The wall-clock time the "Project ready" wording is read at. While `pending` (the step is the
 * current one and has a wait to word) it re-renders only when the wording can change: the expected
 * and slow points after the step's stamp. Off the step no timer is armed, and leaving the step
 * clears it. The composer banner and the setup card show the same level without a per-second
 * tick. `frozenNowMs` pins it for stories.
 */
export function useCloudProjectWaitNow(
  queued: CloudQueuedSend | undefined,
  pending: boolean,
  frozenNowMs?: number,
): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const nextMs =
    pending && frozenNowMs === undefined ? nextCloudProjectWaitChangeMs(queued, nowMs) : null;
  useEffect(() => {
    if (nextMs === null) return;
    const id = setTimeout(() => setNowMs(Math.max(Date.now(), nextMs)), nextMs - Date.now());
    return () => clearTimeout(id);
  }, [nextMs]);
  return frozenNowMs ?? nowMs;
}

/** The composer banner's reading time for a queued send's facts (null while nothing is queued). */
export function useCloudQueuedSendProjectWaitNow(facts: CloudQueuedSendStepFacts | null): number {
  return useCloudProjectWaitNow(
    facts?.queued,
    facts !== null && currentCloudProjectWait(facts) !== null,
  );
}
