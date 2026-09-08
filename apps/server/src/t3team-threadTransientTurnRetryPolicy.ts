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
  if (overrideMs !== undefined) {
    if (Number.isFinite(overrideMs) && overrideMs > 0) {
      return Math.min(Math.round(overrideMs), MAX_RETRY_BACKOFF_OVERRIDE_MS);
    }
  }
  const index = Math.max(0, Math.min(attempt - 1, DEFAULT_RETRY_BACKOFF_MS.length - 1));
  return DEFAULT_RETRY_BACKOFF_MS[index]!;
}

/**
 * When a reservation error carries the gateway's own `retry_after_seconds`
 * directive, the session-level retry is scheduled AT that expiry (+5–15%
 * cushion so we do not race the reservation) instead of the blind backoff
 * ladder. The directive is capped at 60s — the same cap the in-turn gateway
 * retry honors — so a bogus 1-hour directive cannot stall the thread for an
 * hour (the wait is then surfaced in the stop reason instead).
 */
export function transientTurnRetryDelayMs(
  attempt: number,
  directiveSeconds: number | null,
  overrideMs?: number,
  random: () => number = Math.random,
): number {
  const override = transientTurnRetryBackoffMs(attempt, overrideMs);
  if (overrideMs !== undefined && Number.isFinite(overrideMs) && overrideMs > 0) return override;
  if (directiveSeconds !== null) {
    const ms = Math.min(directiveSeconds, MAX_DIRECTIVE_DELAY_SECONDS) * 1000;
    return Math.round(ms * (1.05 + 0.1 * random()));
  }
  return override;
}

const STOP_REASON_MAX_CHARS = 300;

/** Trim a provider-supplied reason to something the UI can render on one row. */
export function truncateStopReason(reason: string): string {
  const flat = reason.replace(/\s+/g, " ").trim();
  if (flat.length <= STOP_REASON_MAX_CHARS) return flat;
  return `${flat.slice(0, STOP_REASON_MAX_CHARS - 1)}…`;
}

/** The stall reason text for a host watchdog fire (the transient trigger). */
export function watchdogStallReason(inactivitySeconds: number): string {
  return `Provider stream stalled (no activity for ${Math.round(inactivitySeconds)}s)`;
}

/** "Retrying (n/N) — reason" — the live stop reason while a retry is queued. */
export function transientRetryInFlightText(
  attempt: number,
  reason: string,
  delayMs?: number,
): string {
  const head = `Retrying (${attempt}/${MAX_SESSION_TRANSIENT_RETRIES}) — ${reason}`;
  if (delayMs === undefined) return head;
  return `${head}, next attempt in ~${Math.max(1, Math.round(delayMs / 1000))}s`;
}

/** The terminal stop reason once the session-level budget is spent. */
export function transientRetryExhaustedText(reason: string): string {
  return `${reason} — automatic retries exhausted (${MAX_SESSION_TRANSIENT_RETRIES} attempts)`;
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
  /\b(gpu_reserved|reservation_error|reservation owner is)\b|(?<!\S)423(?=[:\s]|$)/i;

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
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");
  if (text.trim().length === 0) return null;
  if (!isTransientGatewayErrorText(text)) return null;
  // The directive is read from the RAW text: the summarized reason drops it.
  return { reason: transientTurnReasonText(text), directiveSeconds: retryDirectiveSeconds(text) };
}

/**
 * The reservation-error class carries structured detail ("423: Reservation
 * owner is currently using the GPU; retry shortly", often with
 * `retry_after_seconds`). Surface it as a compact, deterministic reason
 * instead of the raw error body; every other transient keeps its raw text.
 */
export function transientTurnReasonText(reason: string): string {
  if (!RESERVATION_CLASS.test(reason)) return truncateStopReason(reason);
  return "423 — GPU reserved by current owner";
}
