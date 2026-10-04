/**
 * t3code · GHE #297 Defect 2 · idle-gap / tool-stall promotion helpers
 *
 * Pure decision logic split out of `t3team-activityState.ts` (which the
 * additive guard caps at 200 non-empty lines): whether the idle-gap timer
 * should promote a thread to `waiting`, and the in-flight-tool bookkeeping
 * that decision depends on.
 *
 * Background: the idle-gap timer normally promotes to `waiting` only when no
 * tool is in flight (`inFlightTools === 0`) — a long-running tool call is a
 * legitimate reason for silence, so a pending tool suppresses the promotion
 * entirely. But a tool that never reports back (a hung subprocess, a
 * provider that drops the completion event, GHE #297) must not pin the state
 * word on "Working" forever: once a tool has been in flight — with no OTHER
 * output either — for `ACTIVITY_STATE_TOOL_STALL_CEILING_MS`, promote anyway.
 */

/** The subset of `TrackedThread` this module's decisions read or mutate. */
export interface ActivityStallState {
  /** Count of tool-lifecycle items started without a result yet. */
  inFlightTools: number;
  /** Last instant any output arrived (deltas, tool results, tool streams). */
  readonly lastOutputAt: number;
  /**
   * Instant the in-flight tool count went 0→1 (0 while no tool is pending).
   * Reset back to 0 on the 1→0 transition, so a later stall is measured
   * from its own tool, not a previous one.
   */
  inFlightSince: number;
}

/**
 * Ceiling on how long a pending tool call can suppress the `waiting`
 * promotion. 10 minutes: long enough that legitimate slow tools (builds,
 * long-running commands) are never cut off mid-flight, short enough that a
 * genuinely stuck tool still surfaces as `waiting` instead of hanging the
 * state word on "Working" indefinitely.
 */
export const ACTIVITY_STATE_TOOL_STALL_CEILING_MS = 600_000;

/**
 * Whether the idle-gap timer firing right now should promote the thread to
 * `waiting`. True when no tool is in flight, OR when the in-flight tool (and
 * any other output) has been stale for at least `toolStallCeilingMs`.
 */
export function shouldPromoteToWaiting(
  state: ActivityStallState,
  nowMs: number,
  toolStallCeilingMs: number,
): boolean {
  if (state.inFlightTools === 0) return true;
  const referenceAt = Math.max(state.lastOutputAt, state.inFlightSince);
  return nowMs - referenceAt >= toolStallCeilingMs;
}

/**
 * Applies a `tool-started` / `tool-completed` observation to the in-flight
 * bookkeeping `shouldPromoteToWaiting` reads. Mutates `tracked` in place —
 * same convention as the caller's per-thread tracked-state mutation.
 */
export function applyToolLifecycleTransition(
  tracked: Pick<ActivityStallState, "inFlightTools" | "inFlightSince">,
  eventType: "tool-started" | "tool-completed",
  nowMs: number,
): void {
  if (eventType === "tool-started") {
    if (tracked.inFlightTools === 0) tracked.inFlightSince = nowMs;
    tracked.inFlightTools += 1;
    return;
  }
  tracked.inFlightTools = Math.max(0, tracked.inFlightTools - 1);
  if (tracked.inFlightTools === 0) tracked.inFlightSince = 0;
}
