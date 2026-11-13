import { useEffect } from "react";

import { startRendererHeartbeat } from "./t3team-rendererHeartbeat";

/** Starts the desktop renderer heartbeat for the watchdog. No-op in the browser. */
export function useRendererHeartbeat(): void {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the main-process renderer watchdog in step with a live window, via a timer held until unmount
  useEffect(() => startRendererHeartbeat(), []);
}
