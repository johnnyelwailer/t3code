/**
 * Grouping layer for consecutive dynamic (plan-unmatched) workflow rows that share a label.
 *
 * Dynamic agent branches with no authored plan row (see `reconcileT3TeamWorkflowShapeProgress`)
 * can repeat the same label dozens of times — a loop body calling the same agent step once per
 * item renders one row per call. Those runs are journaled as independent activities with no
 * shared step identity, so retries and genuinely-independent repeats are indistinguishable from
 * the data alone; both fold by label here.
 *
 * Split out of `t3team-WorkflowShapeStepRows.tsx`, which owns row orchestration and phase
 * headers; this file owns the grouping decision, status aggregation, and the group row itself.
 */
import { ChevronRightIcon } from "lucide-react";

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
export type DynamicRow = T3TeamWorkflowShapeProgressRow & {
  readonly planStep?: undefined;
  readonly runtimeStep: NonNullable<T3TeamWorkflowShapeProgressRow["runtimeStep"]>;
};

export type RenderUnit =
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
export function groupDynamicRuntimeRows(rows: LiveState["rows"]): RenderUnit[] {
  const units: RenderUnit[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index]!;
    if (row.planStep === undefined && row.runtimeStep !== undefined) {
      const label = fallbackRuntimeLabel(row.runtimeStep);
      const startIndex = index;
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
      // A lone dynamic row is not a repeat of anything — render it as a plain row so it
      // doesn't pick up a bogus "↻1" attempt badge.
      if (group.length === 1) {
        units.push({ kind: "row", row, index: startIndex });
      } else {
        units.push({ kind: "dynamic-group", label, rows: group });
      }
      index = next;
    } else {
      units.push({ kind: "row", row, index });
      index += 1;
    }
  }
  return units;
}

export function aggregateGroupStatus(
  rows: readonly DynamicRow[],
  runStatus: LiveState["status"],
): { readonly icon: StepStatus; readonly completed: number } {
  const statuses = rows.map((row) => displayedStepStatus(row.runtimeStep, runStatus));
  const completed = statuses.filter((entryStatus) => entryStatus === "completed").length;
  const icon = statuses.includes("started")
    ? "started"
    : statuses.includes("failed")
      ? "failed"
      : completed === rows.length
        ? "completed"
        : statuses.includes("waiting")
          ? "waiting"
          : statuses.includes("cancelled")
            ? "cancelled"
            : statuses.includes("paused")
              ? "paused"
              : "pending";
  return { icon, completed };
}

export function T3TeamWorkflowShapeDynamicGroupRow({
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
      <div className="space-y-1">
        <T3TeamWorkflowStepDetails
          step={last.runtimeStep}
          hideDetail={last.runtimeStep.detail === undefined}
          redactDetail={last.runtimeStep.stepKind === "workflow.self-heal"}
          {...(onOpenThread ? { onOpenThread } : {})}
          {...(currentThreadId ? { currentThreadId } : {})}
        >
          <div className="flex items-center gap-2.5" data-step-runtime="unknown">
            <StepStatusIcon status={icon} />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{label}</span>
            {rows.length > 1 ? (
              <span className="shrink-0 rounded-full border border-border/55 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/80">
                ↻{rows.length}
              </span>
            ) : null}
            <StepTrailing
              step={last.runtimeStep}
              wakeAt={undefined}
              childStatuses={childStatuses}
            />
          </div>
        </T3TeamWorkflowStepDetails>
        {rows.length > 1 ? (
          <div className="ml-7 space-y-0.5">
            {rows.map((row, attemptIndex) => (
              <T3TeamWorkflowStepDetails
                key={row.runtimeStep.stepId}
                step={row.runtimeStep}
                hideDetail={row.runtimeStep.detail === undefined}
                redactDetail={row.runtimeStep.stepKind === "workflow.self-heal"}
                {...(onOpenThread ? { onOpenThread } : {})}
                {...(currentThreadId ? { currentThreadId } : {})}
              >
                <span className="text-[11px] text-muted-foreground/70">
                  Attempt {attemptIndex + 1}
                </span>
              </T3TeamWorkflowStepDetails>
            ))}
          </div>
        ) : null}
      </div>
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
            hideDetail={row.runtimeStep.detail === undefined}
            redactDetail={row.runtimeStep.stepKind === "workflow.self-heal"}
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
