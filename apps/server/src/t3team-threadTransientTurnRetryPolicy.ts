/**
 * Pure policy for session-level transient-run retry (GHE #306): the retry
 * budget, the backoff (ladder or the gateway's own retry directive), and the
 * note texts shown in the thread. No state, no effects.
 *
 * What counts as transient is decided by
 * `orchestration-v2/t3team-transientRunFailure.ts` (shared with the
 * manual-continuation eligibility hook in `Orchestrator.ts`).
 *
 * @module t3team-threadTransientTurnRetryPolicy
 */
import type { TransientRunFailure } from "./orchestration-v2/t3team-transientRunFailure.ts";

/** Session-level retry budget for one failure episode. */
export const MAX_SESSION_TRANSIENT_RETRIES = 3;

/** Default backoff ladder (ms) between session-level retry attempts. */
const DEFAULT_RETRY_BACKOFF_MS = [15_000, 30_000, 60_000] as const;

/** Hard cap for the env override — a "transient" wait longer than 2min is a hang. */
const MAX_RETRY_BACKOFF_OVERRIDE_MS = 120_000;

/** Session-level cap for a gateway retry directive (mirrors the in-turn policy). */
const MAX_DIRECTIVE_DELAY_SECONDS = 60;

/**
 * Backoff delay for retry attempt `attempt` (1-based). An env override
 * (`T3TEAM_TRANSIENT_TURN_RETRY_BACKOFF_MS`) replaces the whole ladder for
 * e2e tests.
 */
export function transientTurnRetryBackoffMs(attempt: number, overrideMs?: number): number {
  if (overrideMs !== undefined && Number.isFinite(overrideMs) && overrideMs > 0) {
    return Math.min(Math.round(overrideMs), MAX_RETRY_BACKOFF_OVERRIDE_MS);
  }
  const index = Math.max(0, Math.min(attempt - 1, DEFAULT_RETRY_BACKOFF_MS.length - 1));
  return DEFAULT_RETRY_BACKOFF_MS[index]!;
}

/**
 * When the failure carries the gateway's `retry_after_seconds` directive, the
 * retry is scheduled AT that expiry (+5–15% cushion so it does not race the
 * reservation) instead of the blind ladder, capped at 60s so a bogus 1-hour
 * directive cannot stall the thread.
 */
export function transientTurnRetryDelayMs(
  attempt: number,
  directiveSeconds: number | null,
  overrideMs?: number,
  random: () => number = Math.random,
): number {
  const ladder = transientTurnRetryBackoffMs(attempt, overrideMs);
  if (overrideMs !== undefined && Number.isFinite(overrideMs) && overrideMs > 0) return ladder;
  if (directiveSeconds !== null) {
    const ms = Math.min(directiveSeconds, MAX_DIRECTIVE_DELAY_SECONDS) * 1000;
    return Math.round(ms * (1.05 + 0.1 * random()));
  }
  return ladder;
}

const REASON_MAX_CHARS = 300;

/** Trim a provider-supplied reason to something the UI can render on one row. */
export function truncateStopReason(reason: string): string {
  const flat = reason.replace(/\s+/g, " ").trim();
  if (flat.length <= REASON_MAX_CHARS) return flat;
  return `${flat.slice(0, REASON_MAX_CHARS - 1)}…`;
}

/** 423 / gpu-reservation class, per the shared classifier vocabulary. */
const RESERVATION_CLASS =
  /\b(gpu_reserved|reservation_error|reservation owner is)\b|(?<!\S)423(?=[:\s]|$)/i;

/**
 * The reservation-error class carries structured detail; surface it as a
 * compact, deterministic reason instead of the raw error body. Every other
 * transient keeps its raw text (truncated).
 */
export function transientTurnReasonText(reason: string): string {
  if (!RESERVATION_CLASS.test(reason)) return truncateStopReason(reason);
  return "423 — GPU reserved by current owner";
}

export const transientRetryReason = (failure: TransientRunFailure): string =>
  transientTurnReasonText(failure.message);

/** "Retrying (n/N) — reason, next attempt in ~Ns" — the note while a retry waits. */
export function transientRetryInFlightText(
  attempt: number,
  reason: string,
  delayMs: number,
): string {
  const seconds = Math.max(1, Math.round(delayMs / 1000));
  return `Retrying (${attempt}/${MAX_SESSION_TRANSIENT_RETRIES}) — ${reason}, next attempt in ~${seconds}s`;
}

/** The note once the budget is spent. */
export function transientRetryExhaustedText(reason: string): string {
  return `${reason} — automatic retries exhausted (${MAX_SESSION_TRANSIENT_RETRIES} attempts)`;
}
