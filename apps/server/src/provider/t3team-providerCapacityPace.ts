// @effect-diagnostics globalDate:off — pure calendar math on the epoch the
// broker passed in; nothing in this module reads the clock, so `Date` is
// the right tool and the effect DateTime wrapper would add no safety.
/**
 * Provider capacity pacing — the per-window burn clause for tight windows.
 *
 * Long windows (weekly/monthly, horizon > ~24h) are judged against
 * SUSTAINABLE PACE: the per-day burn that lands exactly on the reset
 * ((100% − used) ÷ days left). The clause anchors on concrete calendar
 * dates: "burning ~18%/day (2.3× sustainable) -> exhausts Oct 26, 3 days
 * before the Nov 1 reset".
 *
 * Short windows (session pools, e.g. Claude's 5-hour) are judged on their
 * own horizon with concrete clock times: "exhausts 14:30Z, resets 18:10Z"
 * — waiting is viable only when the exhaustion lands inside the reset.
 *
 * Honesty rule: a clause is rendered only from an honest observed rate
 * (see `t3team-providerUsageHistory`); a sparse history yields
 * "no recent samples yet". No numbers are ever invented.
 *
 * @module t3team-providerCapacityPace
 */
import type { ProviderCapacityWindow } from "./t3team-providerCapacityWindows.ts";
import type { ProviderUsageBurn } from "./t3team-providerUsageHistory.ts";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (value: number): string => String(value).padStart(2, "0");

/** "18.4" when the decimal carries information, "18" otherwise. */
const fmtNumber = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

/** "Oct 26" — the calendar anchor for long-horizon windows. */
const fmtDate = (epochMs: number): string => {
  const date = new Date(epochMs);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
};

/** "14:30Z", gaining a date prefix when it falls on another UTC day. */
const fmtClock = (epochMs: number, nowEpochMs: number): string => {
  const date = new Date(epochMs);
  const now = new Date(nowEpochMs);
  const clock = `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}Z`;
  return date.getUTCDate() === now.getUTCDate() ? clock : `${fmtDate(epochMs)} ${clock}`;
};

/**
 * The clause body for one tight window (the caller wraps it in parens and
 * joins it after the severity). `nowEpochMs` matches the epoch the broker
 * recorded samples at.
 */
export const describeWindowPace = (
  window: Pick<ProviderCapacityWindow, "usedPercent" | "kind" | "resetsAt">,
  burn: ProviderUsageBurn | undefined,
  nowEpochMs: number,
): string => {
  const remaining = 100 - window.usedPercent;
  if (remaining <= 0)
    return burn !== undefined ? "window already exhausted" : "no recent samples yet";
  if (burn === undefined) return "no recent samples yet";
  const resetEpoch =
    window.resetsAt !== undefined && Number.isFinite(Date.parse(window.resetsAt))
      ? Date.parse(window.resetsAt)
      : undefined;
  const timeToResetMs = resetEpoch !== undefined ? Math.max(0, resetEpoch - nowEpochMs) : undefined;
  const exhaustsAt = nowEpochMs + (remaining / burn.percentPerHour) * HOUR_MS;
  const isLongWindow = window.kind === "weekly" || window.kind === "monthly";
  if (isLongWindow) {
    const actualPerDay = burn.percentPerHour * 24;
    if (timeToResetMs !== undefined && timeToResetMs > 0) {
      const sustainablePerDay = remaining / (timeToResetMs / DAY_MS);
      const multiple = actualPerDay / sustainablePerDay;
      const diffMs = timeToResetMs - (exhaustsAt - nowEpochMs);
      const anchor =
        Math.abs(diffMs) < DAY_MS / 2
          ? `exhausts roughly at the ${fmtDate(resetEpoch!)} reset`
          : diffMs > 0
            ? `exhausts ${fmtDays(diffMs)} before the ${fmtDate(resetEpoch!)} reset`
            : `outlasts the ${fmtDate(resetEpoch!)} reset by ${fmtDays(-diffMs)}`;
      return `burning ~${fmtNumber(actualPerDay)}%/day (${fmtNumber(multiple)}× sustainable) -> ${anchor}`;
    }
    return `burning ~${fmtNumber(actualPerDay)}%/day (no reset reported)`;
  }
  const parts = [`exhausts ${fmtClock(exhaustsAt, nowEpochMs)}`];
  if (timeToResetMs !== undefined && timeToResetMs > 0) {
    parts.push(`resets ${fmtClock(resetEpoch!, nowEpochMs)}`);
  }
  return parts.join(", ");
};

/** "3 days", "1 day" — integer-day counts for long-horizon gaps. */
const fmtDays = (ms: number): string => {
  const days = Math.max(1, Math.round(ms / DAY_MS));
  return `${days} day${days === 1 ? "" : "s"}`;
};
