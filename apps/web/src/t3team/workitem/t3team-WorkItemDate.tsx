import { cn } from "~/t3team/lib/t3team-utils";

const RELATIVE_CUTOFF_MS = 7 * 24 * 60 * 60 * 1000;

const absoluteFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const preciseFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
  timeStyle: "short",
});

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const RELATIVE_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/**
 * Recent timestamps read as "2 days ago", older ones as an absolute date.
 *
 * A relative label is the useful form while something is still in flux, but "412 days ago" is
 * strictly worse than a date — so the two swap over at a week. The full timestamp is always
 * available on hover, which means neither form has to carry the precise value.
 */
export function formatWorkItemDateLabel(timestampMs: number, nowMs: number): string {
  const deltaMs = timestampMs - nowMs;
  if (Math.abs(deltaMs) >= RELATIVE_CUTOFF_MS) {
    return absoluteFormatter.format(timestampMs);
  }

  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (Math.abs(deltaMs) >= unitMs) {
      return relativeFormatter.format(Math.round(deltaMs / unitMs), unit);
    }
  }
  return "just now";
}

export function WorkItemDate({
  timestampMs,
  nowMs,
  emphasis = false,
  className,
}: {
  readonly timestampMs: number;
  readonly nowMs: number;
  /** Set for an overdue date, where the value itself is the thing worth noticing. */
  readonly emphasis?: boolean;
  readonly className?: string;
}) {
  return (
    <time
      dateTime={new Date(timestampMs).toISOString()}
      title={preciseFormatter.format(timestampMs)}
      className={cn("whitespace-nowrap", emphasis && "font-medium text-destructive", className)}
    >
      {formatWorkItemDateLabel(timestampMs, nowMs)}
    </time>
  );
}
