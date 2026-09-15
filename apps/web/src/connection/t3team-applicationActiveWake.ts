// Foreground-resubscribe gate for `application-active` connection wakeups.
//
// Every `application-active` wakeup re-subscribes every live thread stream in
// the app. On a heavy install that is hundreds of concurrent `subscribeThread`
// RPCs at once; the 2026-09-13 server traces show brief window
// blur/refocuses triggering such a burst every 13-90s (~5.5k trace spans in a
// second per burst), and the load made the 15s foreground liveness probe in
// `packages/client-runtime/src/connection/supervisor.ts` time out, which tore
// the session down and started the reconnect loop behind the "disconnected"
// banner. A short hidden interval cannot suspend a local (or a healthy
// remote) socket, so only a real backgrounding of at least this long still
// fires the wake; the probe/reconnect path is otherwise untouched.
export const APPLICATION_ACTIVE_MIN_HIDDEN_MS = 30_000;

export function isApplicationActiveResubscribeWake(
  hiddenSinceEpochMs: number | null,
  shownAtEpochMs: number,
  minHiddenMs: number = APPLICATION_ACTIVE_MIN_HIDDEN_MS,
): boolean {
  if (hiddenSinceEpochMs === null) return false;
  return shownAtEpochMs - hiddenSinceEpochMs >= minHiddenMs;
}
