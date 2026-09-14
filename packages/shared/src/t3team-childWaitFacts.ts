/**
 * The durable child-wait facts shared by the server's `t3team.thread.children`
 * tool and the web parent-row status (GHE #55 follow-up: declared vs derived
 * waiting).
 *
 * A wait is REGISTERED as a `t3team.child_wait.registered` activity on the
 * PARENT thread and closed by a matching `t3team.child_wait.resolved` (same
 * `waitId`). `hasOpenChildWaits` is the open-set predicate over those
 * activities — the DECLARED waiting fact ("this parent explicitly blocked on
 * a child's result via `op: wait`, and that wait is still pending"), as
 * opposed to the DERIVED fact ("this parent's own work is settled and it has
 * live children"). The two answer different questions — "is this thread
 * blocked on something?" vs "is this thread finished?" — and compose the same
 * way `awaitingUserInput` composes with the `waiting` ThreadRunState: a flag
 * riding alongside the state, never a second state with its own precedence.
 *
 * The kind strings are the persisted activity contract, so they live HERE
 * (both the server reactor and the web bridge read them) instead of in the
 * server module that writes them; the server re-exports them for its own
 * call sites.
 *
 * @module childWaitFacts
 */

/** Activity kind: a parent registered a durable child wait (`children op: wait`). */
export const CHILD_WAIT_REGISTERED_KIND = "t3team.child_wait.registered";
/** Activity kind: a registered child wait resolved (child terminal, timeout, or close). */
export const CHILD_WAIT_RESOLVED_KIND = "t3team.child_wait.resolved";

/**
 * True while the thread has at least one REGISTERED child wait without a
 * matching resolved activity: the DECLARED "waiting on a child" fact.
 * Activities arrive in sequence order; registered opens a waitId, resolved
 * closes it (the same open-set discipline as the pending user-input request
 * on a thread's composer).
 */
export function hasOpenChildWaits(
  activities: ReadonlyArray<{ readonly kind: string; readonly payload: unknown }>,
): boolean {
  const openWaitIds = new Set<string>();
  for (const activity of activities) {
    const payload =
      typeof activity.payload === "object" && activity.payload !== null
        ? (activity.payload as Record<string, unknown>)
        : null;
    const waitId = payload !== null && typeof payload.waitId === "string" ? payload.waitId : null;
    if (waitId === null) continue;
    if (activity.kind === CHILD_WAIT_REGISTERED_KIND) {
      openWaitIds.add(waitId);
    } else if (activity.kind === CHILD_WAIT_RESOLVED_KIND) {
      openWaitIds.delete(waitId);
    }
  }
  return openWaitIds.size > 0;
}
