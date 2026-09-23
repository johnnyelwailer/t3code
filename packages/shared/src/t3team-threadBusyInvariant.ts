/**
 * The decider's `thread.turn.start` busy-thread rejection, as a message fragment both sides of
 * the wire can classify. Produced by `apps/server/src/orchestration/decider.ts`'s
 * `OrchestrationCommandInvariantError` detail (`Thread '<id>' already has a turn in progress.`)
 * when {@link import("apps/server/src/t3team-deciderTurnAdmission.ts").admitsTurnStart} rejects
 * an automated turn start racing another one on the same thread. Consumed by the web app's
 * rewrite-launch error mapping (the user retries by hand) and the server's turn-start busy retry
 * (the host retries automatically) — one fragment, so a wording change only breaks one place.
 *
 * @module t3team-threadBusyInvariant
 */
export const THREAD_BUSY_FRAGMENT = "already has a turn in progress";

/** Whether an error message names this exact busy-thread rejection. */
export function isThreadBusyErrorMessage(message: string): boolean {
  return message.includes(THREAD_BUSY_FRAGMENT);
}
