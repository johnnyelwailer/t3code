import type { ThreadBackgroundLiveness } from "./orchestration/ThreadBackgroundLiveness.ts";

const TERMINAL_SESSION_STATUSES: ReadonlySet<string> = new Set(["error", "interrupted", "stopped"]);

/** Decide whether a session state means an armed silence watch is finished. */
export function shouldStopSilenceWatch(
  status: string | undefined,
  liveness: ThreadBackgroundLiveness,
): boolean {
  if (status !== undefined && TERMINAL_SESSION_STATUSES.has(status)) return true;
  return (status === "ready" || status === "idle") && liveness === null;
}
