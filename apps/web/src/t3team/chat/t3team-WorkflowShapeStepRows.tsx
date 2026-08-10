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
import { ChevronRightIcon } from "lucide-react";

import { T3TeamShapeStepRow } from "~/t3team/chat/t3team-messageShapeCard";
import { T3TeamWorkflowStepDetails } from "~/t3team/chat/t3team-WorkflowStepDetails";
import type { T3TeamWorkflowShapeProgressRow } from "~/t3team/chat/t3team-workflowShapeProgress";
import {
  displayedStepStatus,
  fallbackRuntimeLabel,
  RuntimeStepRow,
  StepStatusIcon,
  StepTrailing,
  type StepStatus,
} from "~/t3team/chat/t3team-workflowRunStepRow";
import type { useT3TeamWorkflowShapeLiveState } from "~/t3team/chat/t3team-workflowShapeLiveState";

type LiveState = ReturnType<typeof useT3TeamWorkflowShapeLiveState>;

/** A dynamic row (no authored plan match) with its runtime step guaranteed present. */
type DynamicRow = T3TeamWorkflowShapeProgressRow & {
  readonly planStep?: undefined;
  readonly runtimeStep: NonNullable<T3TeamWorkflowShapeProgressRow["runtimeStep"]>;
};

type RenderUnit =
  | { readonly kind: "row"; readonly row: T3TeamWorkflowShapeProgressRow; readonly index: number }
  | {
      readonly kind: "dynamic-group";
      readonly label: string;
      readonly rows: readonly DynamicRow[];
    };

/**
 * Bundle consecutive dynamic (plan-unmatched) rows that share a label into one render unit.
 * Only dynamic rows are eligible: authored plan rows carry positional meaning (`scheduledPlanRow`,
 * wait-until timers) that grouping would have to thread through, and the reported duplication is
 * entirely dynamic agent-call rows anyway.
 */
function groupDynamicRuntimeRows(rows: LiveState["rows"]): RenderUnit[] {
  const units: RenderUnit[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index]!;
    if (row.planStep === undefined && row.runtimeStep !== undefined) {
      const label = fallbackRuntimeLabel(row.runtimeStep);
      const group: DynamicRow[] = [row as DynamicRow];
      let next = index + 1;
      while (next < rows.length) {
        const candidate = rows[next]!;
        if (
          candidate.planStep !== undefined ||
          candidate.runtimeStep === undefined ||
          fallbackRuntimeLabel(candidate.runtimeStep) !== label
        ) {
          break;
        }
        group.push(candidate as DynamicRow);
        next += 1;
      }
      units.push({ kind: "dynamic-group", label, rows: group });
      index = next;
    } else {
      units.push({ kind: "row", row, index });
      index += 1;
    }
  }
  return units;
}

function aggregateGroupStatus(
  rows: readonly DynamicRow[],
  runStatus: LiveState["status"],
): { readonly icon: StepStatus; readonly completed: number; readonly failed: number } {
  const statuses = rows.map((row) => displayedStepStatus(row.runtimeStep, runStatus));
  const completed = statuses.filter((entryStatus) => entryStatus === "completed").length;
  const failed = statuses.filter((entryStatus) => entryStatus === "failed").length;
  const icon = statuses.includes("failed")
    ? "failed"
    : statuses.includes("started")
      ? "started"
      : statuses.includes("waiting")
        ? "waiting"
        : completed === rows.length
          ? "completed"
          : "pending";
  return { icon, completed, failed };
}

function T3TeamWorkflowShapeDynamicGroupRow({
  label,
  rows,
  status,
  childStatuses,
  onOpenThread,
  currentThreadId,
}: {
  readonly label: string;
  readonly rows: readonly DynamicRow[];
  readonly status: LiveState["status"];
  readonly childStatuses?: Readonly<Record<string, string>>;
  readonly onOpenThread?: (input: { projectId: string; threadId: string }) => void;
  readonly currentThreadId?: string | undefined;
}) {
  const { icon, completed } = aggregateGroupStatus(rows, status);

  // Two or three same-label repeats read as retries of one step more often than as distinct
  // work — fold them into a single row with an attempt badge instead of duplicate rows. Above
  // that, a loop body is the more likely explanation, so keep it collapsible with per-attempt
  // detail (and thread links) still reachable.
  if (rows.length <= 3) {
    const last = rows.at(-1)!;
    return (
      <T3TeamWorkflowStepDetails
        step={last.runtimeStep}
        {...(onOpenThread ? { onOpenThread } : {})}
        {...(currentThreadId ? { currentThreadId } : {})}
      >
        <div className="flex items-center gap-2.5" data-step-runtime="unknown">
          <StepStatusIcon status={icon} />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{label}</span>
          <span className="shrink-0 rounded-full border border-border/55 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/80">
            ↻{rows.length}
          </span>
          <StepTrailing step={last.runtimeStep} wakeAt={undefined} childStatuses={childStatuses} />
        </div>
      </T3TeamWorkflowStepDetails>
    );
  }

  return (
    <details className="group/step-group rounded-md open:bg-muted/25">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md px-1 py-0.5 hover:bg-muted/35 [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-open/step-group:rotate-90" />
        <StepStatusIcon status={icon} />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
          {label} · {completed}/{rows.length}
        </span>
      </summary>
      <div className="ml-7 mt-1 space-y-1.5 border-l border-border/60 pl-3">
        {rows.map((row) => (
          <T3TeamWorkflowStepDetails
            key={row.runtimeStep.stepId}
            step={row.runtimeStep}
            {...(onOpenThread ? { onOpenThread } : {})}
            {...(currentThreadId ? { currentThreadId } : {})}
          >
            <RuntimeStepRow
              step={row.runtimeStep}
              wakeAt={undefined}
              runStatus={status}
              childStatuses={childStatuses}
            />
          </T3TeamWorkflowStepDetails>
        ))}
      </div>
    </details>
  );
}

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
          // legitimately bypass, a script step that never gets skipped in practice, so once
          // the run has settled successfully it almost certainly ran without leaving a
          // reconcilable match. Render it like any other completed step instead of struck
          // through; genuine failure/cancellation still shows through `status`.
          const effectiveStatus: typeof rawStatus =
            rawStatus === "skipped" && planStep?.kind === "act" && status === "completed"
              ? "completed"
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
