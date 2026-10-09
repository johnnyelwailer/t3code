/**
 * Cursor reports an exhausted plan as a plain run error with no code, only text:
 *   "Your team has reached its usage limit … or return on 10/9/2026 when your limit resets."
 *   "Increase limits for faster responses You're out of usage. Switch to Auto or Composer 2.5, …"
 * The SDK run result carries no structured limit or reset time, and the usage reader
 * (`provider/cursorUsageLimits.ts`) only knows the monthly billing-cycle end — weeks away, and no
 * hint of when a model pool frees up — so the text is the only per-failure signal.
 *
 * Classified `usage_limit` WITH a `resetAt`, the thread joins the provider-agnostic upstream
 * recovery (`UsageLimitRecoveryWorker.ts`), which resumes it once `resetAt` passes (when the user
 * enabled auto-resume).
 */
import * as DateTime from "effect/DateTime";

/** The two known phrasings; anything looser (e.g. "failed to fetch usage limit status") must not match. */
const USAGE_LIMIT_TEXT = /\breached its usage limit\b|\byou're out of usage\b/i;
/** Cursor writes the reset day as US `M/D/YYYY`. */
const RESET_DATE = /\breturn on (\d{1,2})\/(\d{1,2})\/(\d{4})\b/i;

/**
 * With an already-passed reset day, probe again after this long: a probe is one run that fails at
 * once while the limit holds, and the worker re-arms with a fresh `resetAt` each time.
 */
export const CURSOR_USAGE_LIMIT_PROBE_MS = 60 * 60 * 1000;

/**
 * "You're out of usage" names no reset at all (the pool can stay empty until the monthly cycle),
 * so probe slowly: ~6 runs a day while auto-resume is on, instead of 24.
 */
export const CURSOR_USAGE_LIMIT_NO_RESET_PROBE_MS = 4 * CURSOR_USAGE_LIMIT_PROBE_MS;

export const isCursorUsageLimitText = (message: string): boolean => USAGE_LIMIT_TEXT.test(message);

/** Reset time (ISO) for a Cursor usage-limit message, always after `nowMs`. */
export function cursorUsageLimitResetAt(message: string, nowMs: number): string {
  const match = RESET_DATE.exec(message);
  if (match !== null) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    // The day only (UTC midnight); a reset that is already today or past means "any moment now"
    // — probe instead.
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const reset = DateTime.makeUnsafe({ year: Number(match[3]), month, day });
      if (DateTime.toEpochMillis(reset) > nowMs) return DateTime.formatIso(reset);
    }
  }
  const probeMs =
    match === null ? CURSOR_USAGE_LIMIT_NO_RESET_PROBE_MS : CURSOR_USAGE_LIMIT_PROBE_MS;
  return DateTime.formatIso(DateTime.makeUnsafe(nowMs + probeMs));
}
