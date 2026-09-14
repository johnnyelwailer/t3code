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

/** The badge for a step row folded from more than one `thread.turn` on the same child thread —
 * see `t3team-workflowShapeThreadTurnFold.ts`. Makes the repeat VISIBLE rather than silently
 * collapsing it into something indistinguishable from a single turn. Renders nothing when the
 * step was not folded (including a genuinely single-turn step). */
export function TurnCountBadge({ step }: { step: T3TeamWorkflowStepEntry | undefined }) {
  if (step?.turnCount === undefined) return null;
  return (
    <span
      data-step-turn-count={step.turnCount}
      className="shrink-0 rounded-full border border-border/55 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/80"
    >
      {step.turnCount} turns
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

/** A child thread's raw stop reason (server's "Retrying (3/14) — provider transient error") is
 * machinery, not a status word: render the compact state word + counter, and keep the reason
 * available in the row's tooltip instead of dumping the whole sentence into the trailing slot
 * (agents-panel UX 2026-09-08, variant 3 "normalize status words"). */
export function normalizeChildStatusLabel(status: string): {
  readonly label: string;
  readonly detail?: string;
} {
  const retry = status.match(/^Retrying \((\d+)\/(\d+)\) — (.+)$/);
  if (retry) {
    const reason = retry[3];
    return reason === undefined
      ? { label: `Retrying ${retry[1]}/${retry[2]}` }
      : { label: `Retrying ${retry[1]}/${retry[2]}`, detail: reason };
  }
  return { label: status };
}

export function StepTrailing({
  step,
  wakeAt,
  childStatuses,
  hideDuration = false,
}: {
  step: T3TeamWorkflowStepEntry | undefined;
  wakeAt?: string | null | undefined;
  childStatuses?: Readonly<Record<string, string>> | undefined;
  /** Inside a collapsed dynamic group the per-row durations are Σ-noise — the group summary
   * shows the total instead. */
  hideDuration?: boolean | undefined;
}) {
  const childStatus = step?.threadId ? childStatuses?.[step.threadId] : undefined;
  if (childStatus) {
    const normalized = normalizeChildStatusLabel(childStatus);
    return (
      <span
        data-step-child-status={childStatus}
        className="max-w-[45%] shrink-0 truncate text-right text-[11px] font-normal text-muted-foreground/70"
        title={normalized.detail ?? childStatus}
      >
        {normalized.label}
      </span>
    );
  }
  return (
    <>
      {hideDuration ? null : <StepDuration step={step} />}
      <StepDue step={step} wakeAt={wakeAt} />
    </>
  );
}

/** An executed step the authored plan has no row for (loop iteration, parallel branch, ...). */
