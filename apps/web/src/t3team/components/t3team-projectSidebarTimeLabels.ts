/**
 * Human time labels for sidebar rows: when a sleeping thread wakes, and how long ago something
 * happened. Its own module because both the status pills and the rows themselves need it — keeping
 * it in `t3team-projectSidebarShared.ts` would make that file and the pills import each other.
 */

export interface DueLabelOptions {
  /** Injectable for deterministic rendering tests. */
  readonly now?: Date;
  readonly locale?: string;
  readonly timeZone?: string;
}

/** Render a scheduled-workflow wake instant as a short human deadline. */
export function formatSleepingUntil(wakeAtIso: string, options: DueLabelOptions = {}): string {
  const date = new Date(wakeAtIso);
  if (Number.isNaN(date.getTime())) return "Due later";
  const now = options.now ?? new Date();
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return "Due now";
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return `Due in ${minutes} min`;

  // Compare calendar dates in the viewer's timezone, not elapsed hours. This stays correct
  // close to midnight and over daylight-saving changes.
  const calendarDay = (value: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: options.timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(value)
      .reduce<Record<string, string>>((result, part) => {
        result[part.type] = part.value;
        return result;
      }, {});
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000;
  };
  const formattedTime = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const daysAway = calendarDay(date) - calendarDay(now);
  if (daysAway === 0) return `Due today at ${formattedTime}`;
  if (daysAway === 1) {
    return `Due tomorrow at ${formattedTime}`;
  }
  const formattedDate = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    month: "short",
    day: "numeric",
  }).format(date);
  return `Due ${formattedDate} at ${formattedTime}`;
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
