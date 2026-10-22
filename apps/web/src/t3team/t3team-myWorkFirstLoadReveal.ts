/**
 * When My Work's first-load greeting ("Good morning…") is allowed on screen.
 *
 * Three rules, so a fast load never flashes and a slow one never snaps:
 *  - **Delayed reveal.** Nothing is shown for the first `REVEAL_DELAY_MS`: a digest that answers
 *    from cache (or a quick round) paints straight away, with no greeting in between.
 *  - **Minimum dwell.** Once the greeting IS visible it stays for at least `MIN_VISIBLE_MS`, so a
 *    result landing a moment after the reveal does not turn it into a half-second blink.
 *  - **One session across mounts.** The startup gate and My Work are different components on
 *    different routes. The greeting the gate revealed is the SAME greeting My Work continues: the
 *    timers carry over a hand-off (within `HANDOFF_GRACE_MS`) instead of restarting, and the art
 *    does not replay its entrance.
 *
 * Pure decisions plus one tiny module-level session; the React side lives in
 * t3team-MyWorkFirstLoadSwap.tsx.
 */

/** Below this the greeting never appears: the content paints directly. */
export const REVEAL_DELAY_MS = 250;
/** Once visible, the greeting stays at least this long. */
export const MIN_VISIBLE_MS = 500;
/** Cross-fade between the greeting and the content. */
export const CROSS_FADE_MS = 220;
/** A greeting unmounted mid-load (gate → My Work) is continued by the next one within this window. */
export const HANDOFF_GRACE_MS = 1_500;

export type FirstLoadPhase =
  /** Loading, inside the reveal delay: render nothing visible (layout is reserved). */
  | "pending"
  /** The greeting is on screen. */
  | "placeholder"
  /** The content is on screen. */
  | "content";

export interface FirstLoadDecision {
  readonly phase: FirstLoadPhase;
  /** When the phase can next change on its own (a timer must re-render then); null when it cannot. */
  readonly wakeAt: number | null;
}

export function resolveFirstLoadPhase(input: {
  readonly loading: boolean;
  readonly now: number;
  readonly startedAt: number;
  readonly shownAt: number | null;
}): FirstLoadDecision {
  const { loading, now, startedAt, shownAt } = input;
  if (shownAt === null) {
    if (!loading) return { phase: "content", wakeAt: null };
    const revealAt = startedAt + REVEAL_DELAY_MS;
    return now < revealAt
      ? { phase: "pending", wakeAt: revealAt }
      : { phase: "placeholder", wakeAt: null };
  }
  if (loading) return { phase: "placeholder", wakeAt: null };
  const releaseAt = shownAt + MIN_VISIBLE_MS;
  return now < releaseAt
    ? { phase: "placeholder", wakeAt: releaseAt }
    : { phase: "content", wakeAt: null };
}

export interface FirstLoadSession {
  readonly startedAt: number;
  shownAt: number | null;
  /** Live holders (mounted swaps). */
  holders: number;
  /** When the last holder let go without the content having been shown. */
  releasedAt: number | null;
}

let current: FirstLoadSession | null = null;

/**
 * The session a newly mounted greeting belongs to: the one a moment-ago hand-off left behind, or a
 * fresh one starting now.
 */
export function acquireFirstLoadSession(now: number): FirstLoadSession {
  if (
    current !== null &&
    (current.holders > 0 ||
      (current.releasedAt !== null && now - current.releasedAt <= HANDOFF_GRACE_MS))
  ) {
    return current;
  }
  current = { startedAt: now, shownAt: null, holders: 0, releasedAt: null };
  return current;
}

export function holdFirstLoadSession(session: FirstLoadSession): void {
  session.holders += 1;
  session.releasedAt = null;
}

/**
 * A holder lets go. `completed` (its content is showing) ends the session, so the next load —
 * another project, a later visit — gets its own reveal delay. An unmount mid-load leaves the
 * session for a hand-off to pick up.
 */
export function releaseFirstLoadSession(
  session: FirstLoadSession,
  input: { readonly completed: boolean; readonly now: number },
): void {
  session.holders = Math.max(0, session.holders - 1);
  if (current !== session) return;
  if (input.completed) {
    current = null;
    return;
  }
  if (session.holders === 0) session.releasedAt = input.now;
}

/** The content is on screen: the session is over for everyone. */
export function finishFirstLoadSession(session: FirstLoadSession): void {
  if (current === session) current = null;
}

export function markFirstLoadShown(session: FirstLoadSession, now: number): void {
  if (session.shownAt === null) session.shownAt = now;
}

export function resetFirstLoadSessionForTests(): void {
  current = null;
}
