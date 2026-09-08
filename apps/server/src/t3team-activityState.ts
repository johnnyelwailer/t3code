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
 * `t3team-activityStateEvent.ts`; the per-thread tracker implementation
 * lives in `t3team-activityStateTracker.ts`.
 */

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

// The per-thread tracker (TrackedThread + createActivityStateTracker) moved to
// `t3team-activityStateTracker.ts`.

export {
  createActivityStateTracker,
} from "./t3team-activityStateTracker.ts";
