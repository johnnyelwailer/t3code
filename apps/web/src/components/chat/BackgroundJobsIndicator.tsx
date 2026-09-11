import { useEffect, useMemo, useState } from "react";

import {
  backgroundJobsSummaryLabel,
  runningBackgroundJobs,
  type BackgroundJobState,
} from "@t3tools/client-runtime/work-log/background-jobs";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";

/**
 * "N background job(s) running · <age>" — the thread-level indicator for
 * bash jobs that outlive their tool call (the agent runtime backgrounds
 * long-running commands; the job settles later, so the thread must not read
 * as idle).
 *
 * Both components own their 1s tick (same pattern as WorkingLeadText): the
 * age display re-renders this small leaf only, never the timeline.
 */

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/**
 * Thread-level line, rendered at the bottom of the message timeline (the
 * list footer) so it sits where the working-row already lives — one quiet
 * line, same visual weight, and it disappears on its own when the last job
 * settles or passes its hard deadline. The tick stops as soon as nothing
 * can still be running, so idle threads pay nothing.
 */
export function BackgroundJobsRunningIndicator({
  jobs,
}: {
  readonly jobs: readonly BackgroundJobState[];
}) {
  const active = runningBackgroundJobs(jobs, Date.now()).length > 0;
  const now = useNow(active);
  const label = useMemo(
    () => backgroundJobsSummaryLabel(runningBackgroundJobs(jobs, now), now),
    [jobs, now],
  );
  if (label === null) return null;
  return (
    <div
      className="flex items-center gap-1.5 px-0.5 py-1 text-sm leading-relaxed text-muted-foreground tabular-nums"
      role="status"
    >
      <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-info" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

/**
 * The tool-card anchor: the bash row whose result yielded a job handle gets a
 * quiet "running in background" age tag so it stops reading as a finished
 * call. Renders nothing once the job settles or passes its hard deadline.
 */
export function BackgroundJobRunningBadge({ job }: { readonly job: BackgroundJobState }) {
  const active = runningBackgroundJobs([job], Date.now()).length > 0;
  const now = useNow(active);
  if (runningBackgroundJobs([job], now).length === 0) return null;
  const age = formatDuration(now - job.startedAtMs);
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-[.7rem] text-muted-foreground tabular-nums"
      role="status"
    >
      <span aria-hidden className="size-1 shrink-0 animate-pulse rounded-full bg-info" />
      running in background · {age}
    </span>
  );
}
