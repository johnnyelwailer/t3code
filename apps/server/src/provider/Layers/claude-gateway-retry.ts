/**
 * Classification + backoff for transient gateway errors that end a Claude
 * turn result: 423 capacity reservations (`gpu_reserved` /
 * `reservation_error`), 429 rate limits, and 5xx outages.
 *
 * The gateway sends explicit retry guidance in the error body —
 * `retry_after_seconds` (also `Retry-After` on HTTP). When present we honor
 * it; otherwise we fall back to exponential backoff with jitter. Permanent
 * errors (400/401/404/413) are never classified transient, and user aborts
 * (`aborted_tools` / `aborted_streaming` / "interrupt") are handled by the
 * caller before this module is consulted.
 */

/** Maximum automatic retries for a transient gateway error inside one turn. */
export const MAX_TRANSIENT_GATEWAY_RETRIES = 5;

/** No single wait may exceed this — a longer window is surfaced, not waited on. */
const MAX_RETRY_DELAY_SECONDS = 60;

const TRANSIENT_GATEWAY_ERROR =
  /\b(retry_after_seconds|retry-after|gpu_reserved|reservation_error|rate.?limit(?:ed)?|capacity\s+(?:is\s+)?reserved|server (?:overloaded|error)|internal server error|bad gateway|service unavailable|gateway time[d]? ?out|request (?:was )?(?:throttled|too large))\b|http(?:\s+status)?[^0-9\n]{0,12}\b(423|429|502|503|504)\b/i;

export function isTransientGatewayErrorText(text: string): boolean {
  if (text.length === 0) return false;
  return TRANSIENT_GATEWAY_ERROR.test(text);
}

const RETRY_DIRECTIVES = [
  /retry_after_seconds["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i,
  /retry-?after["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i,
];

/**
 * Delay before the next attempt, in milliseconds.
 *
 * Order: the server's directive (`retry_after_seconds` / `Retry-After`),
 * capped; otherwise exponential backoff with 50–100% jitter
 * (2s → 4s → 8s …, capped).
 */
export function transientGatewayRetryDelayMs(
  attempt: number,
  text: string,
  random: () => number = Math.random,
): number {
  for (const directive of RETRY_DIRECTIVES) {
    const match = directive.exec(text);
    if (match !== null) {
      const seconds = Number(match[1]);
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.min(seconds, MAX_RETRY_DELAY_SECONDS) * 1000;
      }
    }
  }
  const baseMs = 2_000 * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(baseMs, MAX_RETRY_DELAY_SECONDS * 1000);
  return Math.round(capped * (0.5 + 0.5 * random()));
}

/**
 * The user message that re-drives the session after a transient gateway
 * error. Kept terse: it is transcript-visible and must read as an automatic
 * recovery, not a new user request.
 */
export function gatewayRetrySteerMessage(attempt: number): string {
  return (
    `Automatic retry ${attempt} of ${MAX_TRANSIENT_GATEWAY_RETRIES}: the previous ` +
    `request ended with a transient gateway capacity error and no work was lost. ` +
    `Continue exactly where you stopped; steps already completed remain valid.`
  );
}
