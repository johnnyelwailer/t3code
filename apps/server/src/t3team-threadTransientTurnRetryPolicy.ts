/**
 * Pure policy helpers for session-level transient-turn retry (split out of
 * `t3team-threadTransientTurnRetry.ts` for the additive LOC budget): backoff
 * calculation, stop-reason text formatting, watchdog-stall extraction, and
 * transient-failure classification. No state, no effects.
 *
 * @module t3team-threadTransientTurnRetryPolicy
 */
import {
  isTransientGatewayErrorText,
  retryDirectiveSeconds,
} from "./provider/Layers/t3team-claude-gateway-retry.ts";

/** Session-level retry budget for a transient failure episode. */
export const MAX_SESSION_TRANSIENT_RETRIES = 3;

/** Default backoff ladder (ms) between session-level retry attempts. */
const DEFAULT_RETRY_BACKOFF_MS = [15_000, 30_000, 60_000] as const;

/**
 * Settle window (ms) after a terminal turn event before the reactor persists
 * the retry stop reason: the terminal ingestion's own session sets
 * (turn.completed → ready, session.exited → stopped) race this reactor.
 */
export const IN_FLIGHT_SETTLE_MS = 300;

/** Hard cap for the env override — a "transient" wait longer than 2min is a hang. */
const MAX_RETRY_BACKOFF_OVERRIDE_MS = 120_000;

/** Session-level cap for a gateway retry directive (mirrors the in-turn policy). */
const MAX_DIRECTIVE_DELAY_SECONDS = 60;

/**
 * Backoff delay for session-level retry attempt `attempt` (1-based). The
 * static ladder is used when no directive is present; an env override
 * (`T3TEAM_TRANSIENT_TURN_RETRY_BACKOFF_MS`) replaces the whole ladder for
 * e2e tests.
 */
export function transientTurnRetryBackoffMs(attempt: number, overrideMs?: number): number {
  if (overrideMs !== undefined && Number.isFinite(overrideMs) && overrideMs >= 0) {
    return Math.min(overrideMs, MAX_RETRY_BACKOFF_OVERRIDE_MS);
  }
  const index = Math.max(0, attempt - 1);
  return DEFAULT_RETRY_BACKOFF_MS[Math.min(index, DEFAULT_RETRY_BACKOFF_MS.length - 1)];
}

/**
 * Directive-aware delay: a reservation error carrying `retry_after_seconds`
 * waits until that expiry (capped); anything else takes the backoff ladder.
 */
export function transientTurnRetryDelayMs(
  attempt: number,
  directiveSeconds: number | null,
  overrideMs?: number,
): number {
  if (directiveSeconds !== null && directiveSeconds > 0) {
    return Math.min(directiveSeconds, MAX_DIRECTIVE_DELAY_SECONDS) * 1000;
  }
  return transientTurnRetryBackoffMs(attempt, overrideMs);
}

const STOP_REASON_MAX_CHARS = 300;

/** Trim a provider-supplied reason to something the UI can render on one row. */
export function truncateStopReason(reason: string): string {
  const trimmed = reason.trim();
  return trimmed.length > STOP_REASON_MAX_CHARS
    ? `${trimmed.slice(0, STOP_REASON_MAX_CHARS - 1)}…`
    : trimmed;
}

/** The stall reason text for a host watchdog fire (the transient trigger). */
export function watchdogStallReason(inactivitySeconds: number): string {
  return `Host watchdog: no provider stream activity for ${inactivitySeconds}s`;
}

/** "Retrying (n/N) — reason" — the live stop reason while a retry is queued. */
export function transientRetryInFlightText(
  attempt: number,
  reason: string,
  directiveMs?: number,
): string {
  const base = `Retrying (${attempt}/${MAX_SESSION_TRANSIENT_RETRIES}) — ${truncateStopReason(reason)}`;
  if (directiveMs !== undefined) {
    const seconds = Math.round(directiveMs / 1000);
    return `${base} (next attempt in ~${seconds}s)`;
  }
  return base;
}

/** The terminal stop reason once the session-level budget is spent. */
export function transientRetryExhaustedText(reason: string): string {
  return `Retried ${MAX_SESSION_TRANSIENT_RETRIES}× — ${truncateStopReason(reason)}`;
}

type RuntimeWarningLike = {
  readonly detail?: unknown;
};

/**
 * Read the host-watchdog stall out of a `runtime.warning` event. Non-watchdog
 * warnings (and malformed details) return null — they never arm a retry.
 */
export function readWatchdogStallWarning(
  payload: RuntimeWarningLike,
): { readonly inactivitySeconds: number } | null {
  const detail = payload.detail;
  if (typeof detail !== "object" || detail === null) return null;
  const code = (detail as { code?: unknown }).code;
  if (code !== "turn.inactivity") return null;
  const seconds = (detail as { inactivitySeconds?: unknown }).inactivitySeconds;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return { inactivitySeconds: seconds };
}

type TurnCompletedLike = {
  readonly state: string;
  readonly stopReason?: unknown;
  readonly errorMessage?: unknown;
};

/** 423 / gpu-reservation class, per the shared classifier vocabulary. */
const RESERVATION_CLASS =
  /423|gpu[-_]?reservation|capacity/i;

/**
 * A turn result is transient when it failed AND its error/stop text matches
 * the shared transient-gateway classifier (423 capacity/reservation, 429,
 * 5xx, retry directives). Any other failure is terminal-for-retry purposes
 * (auth, validation, permanent 4xx, max turns...).
 */
export function classifyTransientTurnFailure(
  payload: TurnCompletedLike,
): { readonly reason: string; readonly directiveSeconds: number | null } | null {
  if (payload.state !== "failed") return null;
  const text = [payload.errorMessage, payload.stopReason]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" ");
  if (text.length === 0) return null;
  if (!isTransientGatewayErrorText(text)) return null;
  const directive = retryDirectiveSeconds(text);
  const isReservation = RESERVATION_CLASS.test(text);
  return {
    reason: isReservation ? "gateway capacity/reservation" : "transient gateway error",
    directiveSeconds: directive,
  };
}

/** Human-readable reason text for a transient failure (used in log lines). */
export function transientTurnReasonText(reason: string): string {
  return reason;
}
