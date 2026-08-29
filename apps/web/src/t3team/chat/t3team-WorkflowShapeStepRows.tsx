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
import { TurnCountBadge } from "~/t3team/chat/t3team-workflowStepTrailing";
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
  // Render each authored phase as exactly ONE group. `reconcileT3TeamWorkflowShapeProgress` places
  // a dynamic row at its nearest-prior-matched-plan-step anchor — that is display order — while
  // the phase it reports now comes from the server's `workflowPhase` stamp. The two can disagree:
  // a stamped 'Analyse' row can sit after the 'Summarise' plan rows, which made the 'Analyse'
  // header render a second time (observed live 2026-08-29 on `parallel(items.map(...))`). Bucket
  // units by phase, keeping each phase's first-appearance order and each unit's order within it,
  // so the `priorPlanPhase` walk below emits one header per phase.
  const orderedUnits = (() => {
    const byPhase = new Map<string, typeof units>();
    for (const unit of units) {
      const first = unit.kind === "row" ? unit.row : unit.rows[0]!;
      const key = first.planStep?.phase ?? first.phase ?? "Current work";
      const bucket = byPhase.get(key);
      if (bucket) bucket.push(unit);
      else byPhase.set(key, [unit]);
    }
    return [...byPhase.values()].flat();
  })();
  // Phases that saw at least one dynamic (plan-unmatched) runtime row — evidence that SOME call
  // under this phase demonstrably fired, even though it didn't line up with a specific plan row
  // (a dynamic fan-out like `parallel(items.map(() => agent(...)))` has one call site but many
  // runtime labels; see `reconcileT3TeamWorkflowShapeProgress`). Used below so that call site's
  // OWN plan row does not render as "skipped" once its phase clearly had work happen.
  const dynamicPhaseTitles = new Set(
    rows
      .filter((row) => row.planStep === undefined && row.runtimeStep !== undefined)
      .map((row) => row.phase)
      .filter((phase): phase is string => phase !== null && phase !== undefined),
  );
  return (
    <div className="mt-3 space-y-1.5">
      {(() => {
        let priorPlanPhase: string | null = null;
        return orderedUnits.map((unit) => {
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
          // Two reasons an unmatched plan row's "skipped" look is misleading rather than true,
          // both worth staying neutral about (plain row, pending-style icon, no strikethrough)
          // rather than claiming "completed" and inventing data:
          //  - An unmatched act ("script") plan row only looks "skipped" because no runtime
          //    activity matched it (see `stepMatchesPlan`) — unlike an `ask` that a run can
          //    legitimately bypass, a script step rarely gets skipped in practice, so once the
          //    run has settled successfully it likely ran without leaving a reconcilable match.
          //  - A dynamic-fan-out call site (`agent`/`ask` inside `parallel(items.map(...))`) has
          //    ONE plan row but MANY runtime labels, so the plan row itself never matches even
          //    though its phase demonstrably ran (`dynamicPhaseTitles`, above) — e.g. the
          //    generic `agent(prompt, { label: dynamicLabel })` fallback plan row "Agent turn".
          const dynamicPhaseRanHere =
            planStep !== undefined &&
            planStep.phase !== null &&
            dynamicPhaseTitles.has(planStep.phase);
          const effectiveStatus: typeof rawStatus =
            rawStatus === "skipped" &&
            status === "completed" &&
            (planStep?.kind === "act" || dynamicPhaseRanHere)
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
        });
      })()}
    </div>
  );
}
