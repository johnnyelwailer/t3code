/**
 * Deterministic 4-state activity classifier for active threads (GHE #208).
 *
 * The base "what is this thread doing NOW" word is derived on the server, with
 * NO inference, from the provider runtime event stream — the same source the
 * #40 activity-label reactor already turns into the recent-activity window it
 * feeds the LLM. The LLM free-text label is now only an optional, throttled
 * enrichment rendered after this state word (`{state} · {detail}`).
 *
 * States:
 * - `thinking` — the most recent output was a reasoning/thinking content delta
 *   (drivers that never emit reasoning deltas simply never report thinking —
 *   correct, not a bug). Also the state a turn starts in, and the state right
 *   after a tool result (the model is reasoning over it; no visible output yet).
 * - `writing` — the most recent output was assistant-text content delta.
 * - `working` — a tool-lifecycle item is in flight (started, no result yet).
 * - `waiting` — no output for `ACTIVITY_STATE_IDLE_GAP_MS` with no tool in
 *   flight. A pending tool suppresses the idle gap: silence while a tool call
 *   is in flight is a legitimate long operation (same rule as the GHE #63
 *   silence watchdog's pending-tool distinction).
 *
 * `ACTIVITY_STATE_IDLE_GAP_MS` (30s): long enough that normal thinking/writing
 * interleaving (deltas stream continuously for seconds at a time) never reads
 * as idle, short enough that a genuinely stalled turn says so within ~30s
 * instead of spinning the "Working" word forever.
 *
 * `ACTIVITY_STATE_MIN_TRANSITION_MS` (4s): a debounce on the ACTIVE states
 * (thinking / writing / working). A turn's tool calls and reasoning/assistant
 * deltas can fire in rapid succession (a dozen tool boundaries in a few
 * seconds); persisting every boundary makes the word flicker Working→Thinking
 *→Writing. So once a state is shown, the next DIFFERENT state is only applied
 * after this interval. The first state of a turn (fresh entry, no prior change)
 * and the idle `waiting` promotion are not gated — resuming from waiting shows
 * the live state promptly. null clears (turn ended / user decision) are never
 * gated either.
 *
 * Persist discipline: the tracker persists only on a STATE TRANSITION (plus
 * the null clear on idle/terminal) — never per delta. The deterministic word
 * updates instantly on the transition; the throttled LLM detail catches up
 * lazily on its own cadence (see `t3team-activityLabelSummarizer.ts`).
 *
 * Fail-open: this module never throws into the event stream; consumers
 * `catchCause` at the call site. On any LLM/enrichment failure the UI shows
 * just the state word — never a static "Working", never an error state.
 *
 * The pure runtime-event → observation mapper lives in
 * `t3team-activityStateEvent.ts`.
 */

import type { ActivityStateEvent } from "./t3team-activityStateEvent.ts";

export const ACTIVITY_STATE_IDLE_GAP_MS = 30_000;

/**
 * Debounce on the active state word (thinking / writing / working): a new,
 * DIFFERENT active state is not applied until this much time has passed since
 * the last active-state change. See the module doc. 4s sits in the 3-5s band
 * requested — stable enough to stop the flicker, responsive enough that a
 * genuinely different phase still shows up within seconds.
 */
export const ACTIVITY_STATE_MIN_TRANSITION_MS = 4_000;

export type ThreadActivityState = "thinking" | "writing" | "working" | "waiting";

interface TrackedThread {
  state: ThreadActivityState | null;
  /** Count of tool-lifecycle items started without a result yet. */
  inFlightTools: number;
  /** Last instant any output arrived (deltas, tool results, tool streams). */
  lastOutputAt: number;
  /**
   * Last instant the ACTIVE state word actually changed (0 until the first
   * transition of a turn). Gates the thinking/writing/working debounce. Not
   * touched by the idle `waiting` promotion or null clears, so resuming from
   * waiting (or after an idle gap) shows the live state promptly.
   */
  lastActiveChangeAt: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Per-thread deterministic state machine. Callers feed coarse observations
 * (mapped from provider runtime events); the tracker persists only
 * transitions through `input.persist`.
 */
export function createActivityStateTracker(input: {
  readonly persist: (state: {
    readonly threadId: string;
    readonly state: ThreadActivityState | null;
  }) => Promise<void>;
  readonly idleGapMs?: number;
  /** Debounce interval between active-state (thinking/writing/working) changes. */
  readonly minTransitionMs?: number;
  readonly now?: () => number;
  readonly setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const idleGapMs = input.idleGapMs ?? ACTIVITY_STATE_IDLE_GAP_MS;
  const minTransitionMs = input.minTransitionMs ?? ACTIVITY_STATE_MIN_TRANSITION_MS;
  const now = input.now ?? Date.now;
  const setTimer = input.setTimer ?? setTimeout;
  const clearTimer = input.clearTimer ?? clearTimeout;
  const threads = new Map<string, TrackedThread>();

  const get = (threadId: string): TrackedThread => {
    let tracked = threads.get(threadId);
    if (!tracked) {
      tracked = {
        state: null,
        inFlightTools: 0,
        lastOutputAt: 0,
        lastActiveChangeAt: 0,
        timer: undefined,
      };
      threads.set(threadId, tracked);
    }
    return tracked;
  };

  const setTimerFor = (threadId: string, tracked: TrackedThread, delayMs: number) => {
    if (tracked.timer) clearTimer(tracked.timer);
    tracked.timer = setTimer(() => {
      tracked.timer = undefined;
      // The gap elapsed with no tool in flight: the thread is waiting on
      // something we cannot see (slow provider, stuck turn, …).
      if (tracked.inFlightTools === 0 && tracked.state !== "waiting") {
        tracked.state = "waiting";
        void input.persist({ threadId, state: "waiting" }).catch(() => undefined);
      }
    }, delayMs);
  };

  /** Apply one coarse observation; persists only when the state changes. */
  const note = (event: ActivityStateEvent) => {
    // Turn ended: drop the entry; the persist-null is fired here so it still
    // happens when the domain idle handler's clear() runs later (its tracked
    // entry is already gone, so it never double-persists).
    if (event.type === "turn-ended") {
      const tracked = threads.get(event.threadId);
      threads.delete(event.threadId);
      if (tracked?.timer) clearTimer(tracked.timer);
      if (tracked && tracked.state !== null) {
        void input.persist({ threadId: event.threadId, state: null }).catch(() => undefined);
      }
      return;
    }
    const tracked = get(event.threadId);
    // Blocked on a user decision: the state word would be misleading, and the
    // idle-gap timer must not promote to `waiting` while the user is deciding.
    if (event.type === "input-requested") {
      if (tracked.timer) {
        clearTimer(tracked.timer);
        tracked.timer = undefined;
      }
      if (tracked.state !== null) {
        tracked.state = null;
        void input.persist({ threadId: event.threadId, state: null }).catch(() => undefined);
      }
      return;
    }
    const target: ThreadActivityState | null =
      event.type === "reasoning-delta" ||
      event.type === "turn-started" ||
      event.type === "input-resumed"
        ? "thinking"
        : event.type === "assistant-delta"
          ? "writing"
          : event.type === "tool-started"
            ? "working"
            : event.type === "tool-completed"
              ? "thinking"
              : tracked.state;

    if (event.type === "tool-started") tracked.inFlightTools += 1;
    if (event.type === "tool-completed")
      tracked.inFlightTools = Math.max(0, tracked.inFlightTools - 1);
    if (
      event.type === "reasoning-delta" ||
      event.type === "assistant-delta" ||
      event.type === "tool-completed" ||
      event.type === "turn-started" ||
      event.type === "input-resumed" ||
      event.type === "output"
    ) {
      tracked.lastOutputAt = now();
    }

    if (target !== null && target !== tracked.state) {
      // Debounce the active-state word: only apply a DIFFERENT active state
      // once enough time has passed since the last change. When there is no
      // active state yet (fresh turn / just after a user-input block) the first
      // state applies immediately, so the word never stays on the "Working"
      // fallback when a turn begins.
      const elapsed = now() - tracked.lastActiveChangeAt;
      if (tracked.state === null || elapsed >= minTransitionMs) {
        tracked.state = target;
        tracked.lastActiveChangeAt = now();
        void input.persist({ threadId: event.threadId, state: target }).catch(() => undefined);
      }
    }
    // Re-arm the idle-gap timer from the latest observation. The timer itself
    // only promotes to `waiting` when no tool is in flight.
    setTimerFor(event.threadId, tracked, idleGapMs);
  };

  /**
   * Idle/terminal: drop all tracking and persist the clear so the state word
   * never renders stale on the next activation.
   */
  const clear = async (threadId: string) => {
    const tracked = threads.get(threadId);
    threads.delete(threadId);
    if (tracked?.timer) clearTimer(tracked.timer);
    if (tracked && tracked.state !== null) {
      await input.persist({ threadId, state: null });
    }
  };

  /** The currently tracked state (for the throttled LLM path's coarse-change detection). */
  const stateOf = (threadId: string): ThreadActivityState | null =>
    threads.get(threadId)?.state ?? null;

  return { note, clear, stateOf };
}
