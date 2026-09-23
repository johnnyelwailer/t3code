/**
 * One rendered entry in the live workflow card's top-level step list: an optional phase header
 * plus either a dynamic-group row or a single plan/runtime row. Split out of
 * `t3team-WorkflowShapeStepRows.tsx` so that file keeps ordering/grouping/truncation as its one
 * job while this one owns the per-entry render shape (it used to be inline there before the
 * head/tail truncation pass needed the caller to walk the full list for phase-header bookkeeping
 * without rendering every entry — see `t3team-workflowShapeStepRowsPaging.ts`).
 */
import type { ReactNode } from "react";

import { T3TeamShapeStepRow } from "~/t3team/chat/t3team-messageShapeCard";
import { T3TeamWorkflowStepDetails } from "~/t3team/chat/t3team-WorkflowStepDetails";
import {
  T3TeamWorkflowShapeDynamicGroupRow,
  type RenderUnit,
} from "~/t3team/chat/t3team-workflowShapeStepGrouping";
import {
  displayedStepStatus,
  RuntimeStepRow,
  StepStatusIcon,
  StepTrailing,
} from "~/t3team/chat/t3team-workflowRunStepRow";
import { TurnCountBadge } from "~/t3team/chat/t3team-workflowStepTrailing";
import type { useT3TeamWorkflowShapeLiveState } from "~/t3team/chat/t3team-workflowShapeLiveState";

type LiveState = ReturnType<typeof useT3TeamWorkflowShapeLiveState>;

/** Stable React key for a render unit — shared so the caller's list key matches this file's shape. */
export function stepUnitKey(unit: RenderUnit): string {
  if (unit.kind === "dynamic-group") return `group:${unit.rows[0]!.runtimeStep.stepId}`;
  return unit.row.runtimeStep?.stepId ?? `plan:${unit.index}:${unit.row.planStep?.label ?? "step"}`;
}

export function T3TeamWorkflowShapeStepUnit({
  unit,
  phaseHeader,
  status,
  scheduledPlanRow,
  activeWaitAt,
  dynamicPhaseTitles,
  childStatuses,
  onOpenThread,
  currentThreadId,
}: {
  readonly unit: RenderUnit;
  readonly phaseHeader: ReactNode;
  readonly status: LiveState["status"];
  readonly scheduledPlanRow: number;
  readonly activeWaitAt: string | undefined;
  readonly dynamicPhaseTitles: ReadonlySet<string>;
  readonly childStatuses?: Readonly<Record<string, string>>;
  readonly onOpenThread?: (input: { projectId: string; threadId: string }) => void;
  readonly currentThreadId?: string | undefined;
}) {
  if (unit.kind === "dynamic-group") {
    return (
      <div className="space-y-1.5">
        {phaseHeader}
        <T3TeamWorkflowShapeDynamicGroupRow
          label={unit.label}
          rows={unit.rows}
          status={status}
          {...(childStatuses ? { childStatuses } : {})}
          {...(onOpenThread ? { onOpenThread } : {})}
          {...(currentThreadId ? { currentThreadId } : {})}
        />
      </div>
    );
  }

  const { row, index } = unit;
  const step = row.runtimeStep;
  const planStep = row.planStep;
  const rawStatus = displayedStepStatus(step, status);
  // See the module doc on the original inline version of this branch (git blame) for why an
  // unmatched "skipped"-looking row is treated as neutral "pending" instead in these two cases.
  const dynamicPhaseRanHere =
    planStep !== undefined && planStep.phase !== null && dynamicPhaseTitles.has(planStep.phase);
  const effectiveStatus: typeof rawStatus =
    rawStatus === "skipped" &&
    status === "completed" &&
    (planStep?.kind === "act" || dynamicPhaseRanHere)
      ? "pending"
      : rawStatus;
  return (
    <div className="space-y-1.5">
      {phaseHeader}
      <T3TeamWorkflowStepDetails
        step={step}
        hideDetail={step?.detail === planStep?.label}
        redactDetail={step?.stepKind === "workflow.self-heal"}
        {...(onOpenThread ? { onOpenThread } : {})}
        {...(currentThreadId ? { currentThreadId } : {})}
      >
        {planStep ? (
          <T3TeamShapeStepRow
            step={planStep}
            muted={index !== scheduledPlanRow && effectiveStatus === "skipped"}
            leading={
              <StepStatusIcon status={index === scheduledPlanRow ? "scheduled" : effectiveStatus} />
            }
            trailing={
              <>
                <TurnCountBadge step={step} />
                <StepTrailing
                  step={step}
                  wakeAt={index === scheduledPlanRow ? activeWaitAt : undefined}
                  childStatuses={childStatuses}
                />
              </>
            }
            hideKindLabel={step?.stepKind === "wait.until"}
          />
        ) : step ? (
          <RuntimeStepRow
            step={step}
            wakeAt={undefined}
            runStatus={status}
            childStatuses={childStatuses}
          />
        ) : null}
      </T3TeamWorkflowStepDetails>
    </div>
  );
}
