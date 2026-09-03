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
 * headers; this file owns the grouping decision and status aggregation. Every group of two or
 * more renders through the same collapsible form — capped at ten visible rows with a "Show all N"
 * expander (GHE #403 §5) — in `t3team-workflowShapeStepGroupCollapsed.tsx`. There is no separate
 * "retry" presentation (GHE #414): loop iterations and genuine re-drives of one step are both
 * journaled as independent activities with no shared step identity, and the client shape
 * (`T3TeamWorkflowStepEntry` in `t3team-threadWorkflowStepProgress.ts`) stamps no re-drive marker
 * that would let us tell them apart — so a distinct "Attempt N" treatment would be a label-based
 * guess, not a fact.
 */
import type { T3TeamWorkflowShapeProgressRow } from "~/t3team/chat/t3team-workflowShapeProgress";
import {
  displayedStepStatus,
  fallbackRuntimeLabel,
  type StepStatus,
} from "~/t3team/chat/t3team-workflowRunStepRow";
import { T3TeamWorkflowShapeCollapsedGroup } from "~/t3team/chat/t3team-workflowShapeStepGroupCollapsed";
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
 *
 * One exception (GHE #407): a single-agent-call-site loop has exactly one authored plan row, and
 * `reconcileT3TeamWorkflowShapeProgress` matches it to the FIRST runtime iteration (`findIndex` +
 * `used`), leaving every later iteration plan-unmatched. That leaves one plan-matched row directly
 * ahead of the dynamic group it actually belongs to — rendered standalone as "Count step 2.6s"
 * beside "Count step · 11/11" instead of one "Count step · 12/12" group. When a plan-matched row's
 * runtime step shares its fallback label with the dynamic rows immediately following it, it is
 * absorbed into that group instead of rendered on its own.
 */
export function groupDynamicRuntimeRows(rows: LiveState["rows"]): RenderUnit[] {
  const units: RenderUnit[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index]!;
    const isDynamic = row.planStep === undefined && row.runtimeStep !== undefined;
    const isAbsorbablePlanMatch =
      !isDynamic &&
      row.planStep !== undefined &&
      row.runtimeStep !== undefined &&
      rows[index + 1]?.planStep === undefined &&
      rows[index + 1]?.runtimeStep !== undefined &&
      fallbackRuntimeLabel(rows[index + 1]!.runtimeStep!) === fallbackRuntimeLabel(row.runtimeStep);
    if (isDynamic || isAbsorbablePlanMatch) {
      const label = fallbackRuntimeLabel(row.runtimeStep!);
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
      // doesn't pick up a bogus "↻1" attempt badge. (An absorbable plan-match row is never
      // lone: its absorption condition requires at least one matching dynamic row to follow.)
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

  // Same-label repeats are loop iterations, not retries of one step — the client shape carries
  // no re-drive marker to tell the two apart (see module doc), so every group of two or more
  // renders through the same collapsible form regardless of size (GHE #414).
  return (
    <T3TeamWorkflowShapeCollapsedGroup
      label={label}
      rows={rows}
      icon={icon}
      completed={completed}
      status={status}
      {...(childStatuses ? { childStatuses } : {})}
      {...(onOpenThread ? { onOpenThread } : {})}
      {...(currentThreadId ? { currentThreadId } : {})}
    />
  );
}
