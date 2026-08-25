/**
 * GHE #208 — display-side rendering of the deterministic 4-state activity
 * word + the optional LLM enrichment detail.
 *
 * The base word is ALWAYS deterministic (zero inference): the server
 * classifier (t3team-activityState.ts) persists `activityState` on the thread
 * and it flows to the UI through the same shell/thread plumbing as the #40
 * activity label. The LLM free-text label is only enrichment, rendered AFTER
 * the state word — `{state} · {detail}` — and is present only while the
 * `t3teamActivityLabelsEnabled` flag is on (the pill resolvers gate
 * `activityLabel` on the flag before it reaches this module).
 *
 * Fail-open: flag off or LLM failure leaves `activityLabel` empty and the
 * state word stands alone. A missing `activityState` (old server, or idle)
 * falls back to the pre-#208 rendering: enrichment only when present, else
 * the stable status label. Never a static "Working" when a state word is
 * available, never an error state.
 */
import type { OrchestrationThreadActivityState } from "@t3tools/contracts";

export type ActivityState = OrchestrationThreadActivityState;

export const ACTIVITY_STATE_WORDS: Record<ActivityState, string> = {
  thinking: "Thinking",
  writing: "Writing",
  working: "Working",
  waiting: "Waiting",
};

/**
 * Colors: thinking/writing/working are active work (sky, pulsing — same hue as
 * the "Working" pill, so the state word reads as the same status with a live
 * verb). `waiting` is stalled-quiet: a calmer slate with a SLOWER, shallower
 * pulse (`animate-status-pulse-slow`) so it reads as idle but not dead —
 * dimmer and quieter than the active states, matching the dormant pills.
 */
export function resolveActivityStatePill(state: ActivityState): {
  readonly label: string;
  readonly colorClass: string;
  readonly dotClass: string;
  readonly pulse: boolean;
  readonly pulseClass?: string;
} {
  if (state === "waiting") {
    return {
      label: "Waiting",
      colorClass: "text-slate-500 dark:text-slate-300/80",
      dotClass: "bg-slate-400 dark:bg-slate-300/80",
      pulse: true,
      pulseClass: "animate-status-pulse-slow",
    };
  }
  return {
    label: ACTIVITY_STATE_WORDS[state],
    colorClass: "text-sky-600 dark:text-sky-300/80",
    dotClass: "bg-sky-500 dark:bg-sky-300/80",
    pulse: true,
  };
}

/**
 * The display text for a status pill that may carry a state word and/or an
 * LLM enrichment: `{state} · {detail}` when both, the state word alone when
 * the flag is off / the label is absent, and the pre-#208 fallbacks otherwise
 * (enrichment replacing the label for old servers without the state word).
 */
export function resolveActivityPillDisplay(pill: {
  readonly label: string;
  readonly activityLabel?: string | null;
  readonly activityState?: ActivityState | null;
}): string {
  const state = pill.activityState;
  if (state !== undefined && state !== null) {
    const word = ACTIVITY_STATE_WORDS[state] ?? state;
    const detail = pill.activityLabel?.trim();
    return detail ? `${word} · ${detail}` : word;
  }
  const detail = pill.activityLabel?.trim();
  return detail || pill.label;
}

/**
 * The pulse animation class for a status pill: nothing when `pulse` is false,
 * the pill's own override when present (e.g. `waiting` → the slower,
 * shallower `animate-status-pulse-slow`), else the standard
 * `animate-status-pulse`. Same animation the #40 pill already ran; the state
 * word just picks which variant.
 */
export function activityPulseClass(pill: {
  readonly pulse: boolean;
  readonly pulseClass?: string;
}): string {
  return pill.pulse ? (pill.pulseClass ?? "animate-status-pulse") : "";
}
