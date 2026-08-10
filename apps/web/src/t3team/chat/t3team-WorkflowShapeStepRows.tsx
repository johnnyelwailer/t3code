/**
 * The reconciled plan/runtime step list inside the live workflow card.
 *
 * Its own component because it is the card's largest block and the only one with real branching:
 * each row is a plan step, a runtime step, or both, and phase headers appear only when the phase
 * changes from the previous row — which is why the map carries `priorPlanPhase` across iterations.
 *
 * Dynamic agent branches with no authored plan row (see `reconcileT3TeamWorkflowShapeProgress`)
 * can repeat the same label dozens of times — a loop body calling the same agent step once per
 * item renders one row per call. Those runs are journaled as independent activities with no
 * shared step identity, so retries and genuinely-independent repeats are indistinguishable from
 * the data alone; both fold by label (see `groupDynamicRuntimeRows` below).
 */
import { T3TeamShapeStepRow } from "~/t3team/chat/t3team-messageShapeCard";
import { T3TeamWorkflowStepDetails } from "~/t3team/chat/t3team-WorkflowStepDetails";
import {
  groupDynamicRuntimeRows,
  T3TeamWorkflowShapeDynamicGroupRow,
} from "~/t3team/chat/t3team-workflowShapeStepGrouping";
import {
  displayedStepStatus,
  RuntimeStepRow,
  StepStatusIcon,
  StepTrailing,
} from "~/t3team/chat/t3team-workflowRunStepRow";
import type { useT3TeamWorkflowShapeLiveState } from "~/t3team/chat/t3team-workflowShapeLiveState";

type LiveState = ReturnType<typeof useT3TeamWorkflowShapeLiveState>;

export function T3TeamWorkflowShapeStepRows({
  rows,
  status,
  scheduledPlanRow,
  activeWaitAt,
  childStatuses,
  onOpenThread,
  currentThreadId,
}: {
  readonly rows: LiveState["rows"];
  readonly status: LiveState["status"];
  readonly scheduledPlanRow: number;
  readonly activeWaitAt: string | undefined;
  readonly childStatuses?: Readonly<Record<string, string>>;
  readonly onOpenThread?: (input: { projectId: string; threadId: string }) => void;
  readonly currentThreadId?: string | undefined;
}) {
  const units = groupDynamicRuntimeRows(rows);
  return (
    <div className="mt-3 space-y-1.5">
      {(() => {
        let priorPlanPhase: string | null = null;
        return units.map((unit) => {
          const firstRow = unit.kind === "row" ? unit.row : unit.rows[0]!;
          const phaseTitle = firstRow.planStep?.phase ?? firstRow.phase ?? "Current work";
          const showPhaseHeader = phaseTitle !== null && phaseTitle !== priorPlanPhase;
          if (phaseTitle !== null) priorPlanPhase = phaseTitle;
          const phaseHeader = showPhaseHeader ? (
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65">
              {phaseTitle}
            </p>
          ) : null;

          if (unit.kind === "dynamic-group") {
            return (
              <div key={`group:${unit.rows[0]!.runtimeStep.stepId}`} className="space-y-1.5">
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
          // An unmatched act ("script") plan row only looks "skipped" because no runtime
          // activity matched it (see `stepMatchesPlan`) — unlike an `ask` that a run can
          // legitimately bypass, a script step rarely gets skipped in practice, so once the
          // run has settled successfully it likely ran without leaving a reconcilable match.
          // We don't actually know that, though — claiming "completed" would invent data
          // (a conditionally-skipped script would show a false green check). Stay neutral:
          // plain row, pending-style icon, no strikethrough.
          const effectiveStatus: typeof rawStatus =
            rawStatus === "skipped" && planStep?.kind === "act" && status === "completed"
              ? "pending"
              : rawStatus;
          return (
            <div
              key={step?.stepId ?? `plan:${index}:${planStep?.label ?? "step"}`}
              className="space-y-1.5"
            >
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
                      <StepStatusIcon
                        status={index === scheduledPlanRow ? "scheduled" : effectiveStatus}
                      />
                    }
                    trailing={
                      <StepTrailing
                        step={step}
                        wakeAt={index === scheduledPlanRow ? activeWaitAt : undefined}
                        childStatuses={childStatuses}
                      />
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
        });
      })()}
    </div>
  );
}
