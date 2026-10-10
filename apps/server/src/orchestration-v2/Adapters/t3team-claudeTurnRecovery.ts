/**
 * Claude turn-recovery policy layered on `ClaudeAdapterV2`.
 *
 * - Interrupted classification: an undici/fetch `DOMException` abort ("This
 *   operation was aborted") or an SDK "Request was aborted" ends a turn the
 *   host or CLI cancelled mid-tool-call; it reads as `interrupted`, never as a
 *   provider fault that fails the turn.
 * - Transient gateway re-drive: a failed result whose errors read as a
 *   transient gateway error (423 capacity reservation, 429, 5xx) keeps the turn
 *   running, waits (the gateway's own retry directive, else jittered backoff)
 *   and re-prompts the live query with an automatic "continue" message, at most
 *   `MAX_TRANSIENT_GATEWAY_RETRIES` times per turn. Permanent errors are never
 *   re-driven.
 *
 * @module t3team-claudeTurnRecovery
 */
import * as Cause from "effect/Cause";

import {
  gatewayRetrySteerMessage,
  isTransientGatewayErrorText,
  MAX_TRANSIENT_GATEWAY_RETRIES,
  transientGatewayRetryDelayMs,
} from "../../provider/t3team-claude-gateway-retry.ts";

const INTERRUPTED_PHRASES = [
  "all fibers interrupted without error",
  "request was aborted",
  // DOMException AbortError phrasing (undici/fetch layer).
  "this operation was aborted",
  "interrupted by user",
] as const;

export function isClaudeInterruptedMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return INTERRUPTED_PHRASES.some((phrase) => normalized.includes(phrase));
}

/**
 * True when a query stream failed (a typed failure or defect, never a bare fiber interruption,
 * which is how a dead process ends the stream) with an abort error.
 */
export function isClaudeInterruptedCause(cause: Cause.Cause<unknown>): boolean {
  return cause.reasons.some(
    (reason) =>
      (Cause.isFailReason(reason) && isClaudeInterruptedFailure(reason.error)) ||
      (Cause.isDieReason(reason) && isClaudeInterruptedFailure(reason.defect)),
  );
}

/** True when an error (or any error on its `cause` chain) carries an abort phrasing. */
export function isClaudeInterruptedFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    if (typeof current === "string") return isClaudeInterruptedMessage(current);
    if (typeof current !== "object") return false;
    const { message, cause } = current as { readonly message?: unknown; readonly cause?: unknown };
    if (typeof message === "string" && isClaudeInterruptedMessage(message)) return true;
    current = cause;
  }
  return false;
}

export interface ClaudeGatewayRedrive {
  /** 1-based attempt number of this re-drive. */
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
  /** The automatic prompt that re-drives the turn. */
  readonly text: string;
  /** The gateway error the failed result carried. */
  readonly errorText: string;
}

// Keyed by the adapter's per-turn context object: the budget resets with every new turn and
// needs no cleanup.
const attemptsByTurn = new WeakMap<object, number>();

/**
 * The next re-drive for a failed result of `turn`, or `null` when the result is not a transient
 * gateway failure or the turn spent its budget. Records the attempt.
 */
export function planClaudeGatewayRedrive(
  turn: object,
  errorText: string,
  random: () => number = Math.random,
): ClaudeGatewayRedrive | null {
  if (!isTransientGatewayErrorText(errorText)) return null;
  const attempt = (attemptsByTurn.get(turn) ?? 0) + 1;
  if (attempt > MAX_TRANSIENT_GATEWAY_RETRIES) return null;
  attemptsByTurn.set(turn, attempt);
  return {
    attempt,
    maxAttempts: MAX_TRANSIENT_GATEWAY_RETRIES,
    retryDelayMs: transientGatewayRetryDelayMs(attempt, errorText, random),
    text: gatewayRetrySteerMessage(attempt),
    errorText,
  };
}
