/**
 * Shared types and decision helpers for session-level transient-turn retry
 * (split out of `t3team-threadTransientTurnRetry.ts` for the additive LOC
 * budget). The types define the tracker's state and decision shapes; the
 * decision helpers compute the next decision from a state entry.
 *
 * @module t3team-threadTransientTurnRetryDecision
 */
import {
  MAX_SESSION_TRANSIENT_RETRIES,
  transientRetryExhaustedText,
  transientRetryInFlightText,
} from "./t3team-threadTransientTurnRetryPolicy.ts";

export interface TransientTurnRetryState {
  /** Session-level retry attempts already made for this failure episode. */
  attempts: number;
  /** Pending host-watchdog stall marker awaiting the abort event. */
  stall: { readonly turnId: string; readonly reason: string } | null;
  /**
   * True from a `thread.turn-interrupt-requested` until the thread's next
   * `turn.started`: the turn died on a user/cascade stop and must never be
   * resurrected.
   */
  userStopped: boolean;
  /**
   * The class of the most recent terminal turn. A `session.exited` right
   * after a TRANSIENT death is part of the same death (several drivers —
   * observed on the claudeAgent driver — end the session when the
   * interrupted turn ends) and must not erase the scheduled-retry
   * bookkeeping; every other outcome ends the episode.
   */
  lastTerminal: "transient" | "success" | "other" | null;
}

export type TransientTurnRetryDecision =
  | {
      readonly kind: "retry";
      readonly attempt: number;
      readonly reason: string;
      /** "Retrying (n/N) — reason" for the live session stop reason. */
      readonly inFlightText: string;
      /** How long to wait before re-issuing the turn. */
      readonly delayMs: number;
    }
  | {
      readonly kind: "exhausted";
      readonly reason: string;
      /** The terminal stop reason to persist on the session. */
      readonly exhaustedText: string;
    }
  | {
      readonly kind: "persist-reason";
      readonly reason: string;
    }
  | undefined;

export interface TransientTurnRetryTracker {
  readonly state: Map<string, TransientTurnRetryState>;
  /** A host-watchdog `runtime.warning` armed for a turn. */
  readonly onStallWarning: (
    threadId: string,
    turnId: string | undefined,
    payload: { readonly detail?: unknown },
  ) => void;
  /** Any `turn.started` for the thread. */
  readonly onTurnStarted: (threadId: string) => void;
  /** `thread.turn-interrupt-requested` (user or cascade stop). */
  readonly onInterruptRequested: (threadId: string) => void;
  /** A new user message ends the current failure episode. */
  readonly onUserMessage: (threadId: string) => void;
  /** `turn.aborted` / `turn.completed` / `session.exited` for the thread. */
  readonly onTurnTerminal: (
    threadId: string,
    turnId: string | undefined,
    event: { readonly type: string; readonly payload: unknown },
  ) => TransientTurnRetryDecision;
}

export interface TransientTurnRetryTrackerOptions {
  /**
   * Delay resolver for a retry attempt. Defaults to the static backoff
   * ladder; the Live layer supplies the directive-aware
   * `transientTurnRetryDelayMs` so reservation `retry_after_seconds`
   * directives schedule the retry at their expiry.
   */
  readonly delayMs?: (attempt: number, reason: string, directiveSeconds: number | null) => number;
}

/** Compute the decision for a transient failure at the current attempt count. */
export function decisionForTransient(
  entry: TransientTurnRetryState,
  reason: string,
  resolveDelay: (attempt: number, reason: string, directiveSeconds: number | null) => number,
  directiveSeconds?: number | null,
): TransientTurnRetryDecision {
  if (entry.attempts >= MAX_SESSION_TRANSIENT_RETRIES) {
    return {
      kind: "exhausted",
      reason,
      exhaustedText: transientRetryExhaustedText(reason),
    };
  }
  entry.attempts += 1;
  const directive = directiveSeconds ?? null;
  const delayMs = resolveDelay(entry.attempts, reason, directive);
  const directiveMs = directive === null ? undefined : delayMs;
  return {
    kind: "retry",
    attempt: entry.attempts,
    reason,
    delayMs,
    inFlightText: transientRetryInFlightText(entry.attempts, reason, directiveMs),
  };
}

/**
 * Consume the pending stall marker if it matches this terminal turn. Returns
 * the transient decision, or null when no marker applies.
 */
export function stallDecisionFor(
  entry: TransientTurnRetryState,
  turnId: string | undefined,
  resolveDelay: (attempt: number, reason: string, directiveSeconds: number | null) => number,
): TransientTurnRetryDecision | null {
  if (entry.stall === null) return null;
  const matches = turnId === undefined || entry.stall.turnId === turnId;
  const reason = entry.stall.reason;
  entry.stall = null;
  if (!matches) return null;
  return decisionForTransient(entry, reason, resolveDelay);
}
