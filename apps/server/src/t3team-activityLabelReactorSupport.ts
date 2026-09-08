/**
 * Design notes + pure helpers for the live "working on" label reactor
 * (`t3team-activityLabelReactor.ts`), split out of that module.
 *
 * Two independent writers on the same channel, both fail-open:
 *
 * 1. DETERMINISTIC 4-state base word (GHE #208, always on, zero inference):
 *    a per-thread state machine over the provider runtime event stream
 *    (thinking / writing / working / waiting), persisted as `activityState`
 *    on thread meta on every STATE TRANSITION only — the word updates
 *    instantly. `waiting` fires after `ACTIVITY_STATE_IDLE_GAP_MS` (30s) of
 *    silence with no tool in flight.
 * 2. OPTIONAL LLM free-text enrichment (GHE #40, throttled): a separate, tiny
 *    text-generation request — never a chat message, activity, or provider
 *    turn. Light-inference guarantees (enforced in
 *    `t3team-activityLabelSummarizer.ts` + the `generateActivityLabel` op):
 *    - TINY payload: only the last 5 meaningful activities (kind + short
 *      summary) plus a one-line user-intent gist, hard-capped to ~400 chars.
 *    - NON-thinking: the aux model selection is option-stripped and the op
 *      asks the driver for no reasoning effort / thinking budget.
 *    - THROTTLED SLOWLY: debounced ~20s after the last activity AND at most
 *      once per ~60s (minRegenerateMs); the only immediate trigger is a
 *      coarse state change, which defers into the remaining 60s window.
 *      The deterministic word updates instantly; the detail catches up lazily.
 *    - SKIPPED when the recent-activity window is unchanged since the last
 *      generation; CLEARED on idle/terminal.
 *    - TIME-BOXED (GHE #208 follow-up): a persisted label gets a minimum
 *      life of `ACTIVITY_LABEL_TTL_MS` (5s — PJ's decision: give an LLM
 *      status text a minimum time to live, then let either new LLM text or
 *      the live deterministic state word override it). The clear is
 *      scheduled inside `createActivityLabelSummarizer` after each persist;
 *      a newer label reschedules it, the turn-end clear cancels it, and a
 *      late fire is no-oped by the timer-handle guard. After expiry the
 *      display falls back to the live `activityState` word automatically via
 *      the existing pill precedence. The throttle above (light inference,
 *      slow generation) is untouched.
 *    - Gated by the `t3teamActivityLabelsEnabled` settings flag: off = no LLM
 *      calls, the UI shows just the state word.
 *
 * FAIL-OPEN end to end: on any error the state word stands alone — never a
 * static "Working", never an error state, never a hanging spinner.
 */

import {
  CommandId,
  ThreadId,
  type OrchestrationThreadActivityState,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

/**
 * Fail-open persist of a thread-meta update (activity label or state word):
 * runs the dispatch and swallows any error — the label channel must never
 * throw into the event stream.
 */
export function persistThreadMeta(
  engine: OrchestrationEngineShape,
  threadId: string,
  meta:
    | { activityLabel?: string | null }
    | { activityState?: OrchestrationThreadActivityState | null },
) {
  return Effect.runPromise(
    engine.dispatch({
      type: "thread.meta.update",
      commandId: CommandId.make(`server:t3team:activity:${t3teamRandomUUID()}`),
      threadId: ThreadId.make(threadId),
      ...meta,
    }),
  ).catch(() => undefined);
}

/**
 * Parse the `T3TEAM_ACTIVITY_LABEL_TTL_MS` env override for the LLM label TTL
 * (the 5s minimum life). Only non-negative finite ints are honored; anything
 * else returns undefined so the caller falls back to the ACTIVITY_LABEL_TTL_MS
 * default.
 */
export function parseActivityLabelTtlMs(raw: string | undefined): number | undefined {
  const parsedTtl = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsedTtl) && parsedTtl >= 0 ? parsedTtl : undefined;
}
