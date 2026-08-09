/**
 * The reconciled plan/runtime step list inside the live workflow card.
 *
 * Its own component because it is the card's largest block and the only one with real branching:
 * each row is a plan step, a runtime step, or both, and phase headers appear only when the phase
 * changes from the previous row — which is why the map carries `priorPlanPhase` across iterations.
 */
import { T3TeamShapeStepRow } from "~/t3team/chat/t3team-messageShapeCard";
import { T3TeamWorkflowStepDetails } from "~/t3team/chat/t3team-WorkflowStepDetails";
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
  return (
    <div className="mt-3 space-y-1.5">
      {(() => {
        let priorPlanPhase: string | null = null;
        return rows.map((row, index) => {
          const step = row.runtimeStep;
          const planStep = row.planStep;
          const phaseTitle = planStep?.phase ?? row.phase ?? "Current work";
          const showPhaseHeader = phaseTitle !== null && phaseTitle !== priorPlanPhase;
          if (phaseTitle !== null) priorPlanPhase = phaseTitle;
          return (
            <div
              key={step?.stepId ?? `plan:${index}:${planStep?.label ?? "step"}`}
              className="space-y-1.5"
            >
              {showPhaseHeader ? (
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65">
                  {phaseTitle}
                </p>
              ) : null}
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
                    muted={
                      index !== scheduledPlanRow && displayedStepStatus(step, status) === "skipped"
                    }
                    leading={
                      <StepStatusIcon
                        status={
                          index === scheduledPlanRow
                            ? "scheduled"
                            : displayedStepStatus(step, status)
                        }
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
