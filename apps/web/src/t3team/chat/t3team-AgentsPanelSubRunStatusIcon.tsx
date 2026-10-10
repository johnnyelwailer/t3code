/**
 * Sub-run status glyph. Question and error keep their own marks. Every other
 * word uses ThreadActivityMorphIcon: solid (check drawn) when Completed,
 * a pulsing dashed ring while the run is live. `spinTick` bumps when the
 * live phrase changes so the ring does one springy spin.
 */
import { CircleAlertIcon, CircleQuestionMarkIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { ThreadActivityMorphIcon } from "~/components/t3team-ThreadActivityStatus";
import type { ProjectThread } from "~/t3team/t3team-types";

const STATIC_LABELS = new Set([
  "Waiting",
  "Failed",
  "Stopped",
  "Completed",
  "Idle",
  "Question awaiting answer",
  "Plan awaiting approval",
]);

function isLiveLabel(label: string | undefined, status: ProjectThread["status"]): boolean {
  if (label === undefined) return status === "running";
  return !STATIC_LABELS.has(label);
}

export function SubRunStatusIcon({
  status,
  label,
  pendingUserInput = false,
  awaitingParent = false,
  spinTick = 0,
  className,
}: {
  status: ProjectThread["status"];
  /** Resolved status word. Absent on the compact settled fold. */
  label?: string;
  pendingUserInput?: boolean;
  awaitingParent?: boolean;
  spinTick?: number;
  /** Optional size override (the fold list renders smaller glyphs). */
  className?: string;
}) {
  const iconClass = className ?? "size-3";
  if (pendingUserInput || awaitingParent) {
    return (
      <CircleQuestionMarkIcon
        aria-hidden
        data-sub-run-status=""
        className={cn("shrink-0 text-warning-foreground", iconClass)}
      />
    );
  }
  if (status === "error" || label === "Failed") {
    return (
      <CircleAlertIcon
        aria-hidden
        data-sub-run-status=""
        className={cn("shrink-0 text-destructive", iconClass)}
      />
    );
  }
  const completed = label === "Completed" || (label === undefined && status === "completed");
  if (completed) {
    return <ThreadActivityMorphIcon solid size="sm" className={cn("text-success", iconClass)} />;
  }
  const live = isLiveLabel(label, status);
  return (
    <span
      data-sub-run-status=""
      className={cn(
        "shrink-0",
        live ? "text-info-foreground" : "text-muted-foreground/40",
        className,
      )}
    >
      <ThreadActivityMorphIcon
        solid={false}
        size="sm"
        pulse={live}
        spin={live}
        spinTick={spinTick}
      />
    </span>
  );
}
