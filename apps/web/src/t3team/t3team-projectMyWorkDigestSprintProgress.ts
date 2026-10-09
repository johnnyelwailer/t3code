import type { DigestSprint } from "~/t3team/t3team-projectMyWorkDigestTypes";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where "now" sits on the digest sprint's time axis. `pct` is always a finite 0-100, or null
 * when the sprint's dates cannot say (missing, unparsable, or an empty span): the header hides
 * its progress row then instead of drawing a broken 0 % bar. `ended` carries the label that
 * replaces the "% elapsed" text once the sprint is over, so a stale "active" sprint reads
 * "ended 14 d ago" rather than a misleading full bar.
 */
export type DigestSprintProgress = {
  readonly total: number;
  readonly day: number;
  readonly daysLeft: number;
  readonly pct: number | null;
  readonly ended: string | null;
};

export function digestSprintProgress(
  sprint: Pick<DigestSprint, "startDate" | "endDate" | "state">,
  nowMs: number,
): DigestSprintProgress {
  const start = Date.parse(sprint.startDate);
  const end = Date.parse(sprint.endDate);
  const known =
    Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(nowMs) && end > start;
  if (!known) return { total: 0, day: 0, daysLeft: 0, pct: null, ended: null };
  const total = Math.max(1, Math.round((end - start) / DAY_MS));
  const day = Math.min(total, Math.max(1, Math.ceil((nowMs - start) / DAY_MS)));
  const pct = Math.min(100, Math.max(0, Math.round(((nowMs - start) / (end - start)) * 100)));
  const pastEnd = nowMs > end;
  const endedDays = Math.floor((nowMs - end) / DAY_MS);
  const ended = pastEnd
    ? endedDays > 0
      ? `ended ${endedDays} d ago`
      : "ended"
    : sprint.state?.toLowerCase() === "closed"
      ? "closed"
      : null;
  return { total, day, daysLeft: pastEnd ? 0 : total - day, pct, ended };
}
