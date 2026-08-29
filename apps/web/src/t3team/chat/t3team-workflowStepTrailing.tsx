/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * The right-hand end of a runtime step row: when a scheduled step is due, and a child thread's status.
 *
 * Its own module so the step row stays inside the 200-line cap after `t3team-messageShapeCardLive` was
 * broken up.
 */

import { formatDuration } from "~/session-logic";
import type { T3TeamWorkflowStepEntry } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import { formatWorkflowStepDue } from "~/t3team/chat/t3team-workflowRunLabels";

/** Below this, a step's duration is noise — a "3ms" tag on every trivial step would bury the
 * slow step this feature exists to surface. */
const STEP_DURATION_DISPLAY_THRESHOLD_MS = 1_000;

/** The step's resolved duration, formatted the same way as a turn's "Worked for …" trailing
 * label (`formatDuration` in `~/session-logic`) — omitted below the noise threshold and when the
 * server never captured one (see `T3TeamWorkflowStepEntry.durationMs`). */
export function StepDuration({ step }: { step: T3TeamWorkflowStepEntry | undefined }) {
  if (step?.durationMs === undefined || step.durationMs < STEP_DURATION_DISPLAY_THRESHOLD_MS) {
    return null;
  }
  return (
    <span data-step-duration className="shrink-0 text-[11px] text-muted-foreground/70">
      {formatDuration(step.durationMs)}
    </span>
  );
}

export function StepDue({
  step,
  wakeAt,
}: {
  step: T3TeamWorkflowStepEntry | undefined;
  wakeAt?: string | null | undefined;
}) {
  if (step?.phase === "completed" || step?.phase === "failed" || step?.phase === "cancelled") {
    return null;
  }
  if (wakeAt === undefined || wakeAt === null) return null;
  const due = formatWorkflowStepDue(wakeAt ?? undefined);
  return due ? (
    <span data-step-due className="shrink-0 text-[11px] text-muted-foreground/70">
      {due}
    </span>
  ) : null;
}

export function StepTrailing({
  step,
  wakeAt,
  childStatuses,
}: {
  step: T3TeamWorkflowStepEntry | undefined;
  wakeAt?: string | null | undefined;
  childStatuses?: Readonly<Record<string, string>> | undefined;
}) {
  const childStatus = step?.threadId ? childStatuses?.[step.threadId] : undefined;
  if (childStatus) {
    return (
      <span
        data-step-child-status={childStatus}
        className="max-w-[45%] shrink-0 truncate text-right text-[11px] font-normal text-muted-foreground/70"
        title={childStatus}
      >
        {childStatus}
      </span>
    );
  }
  return (
    <>
      <StepDuration step={step} />
      <StepDue step={step} wakeAt={wakeAt} />
    </>
  );
}

/** An executed step the authored plan has no row for (loop iteration, parallel branch, ...). */
