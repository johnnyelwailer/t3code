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
 *
 * A long run can also carry many distinct entries with no repeats at all — the list itself shows
 * only the first/last few by default and folds the rest behind an "… N earlier" affordance (see
 * `t3team-workflowShapeStepRowsPaging.ts`); per-entry rendering lives in
 * `t3team-workflowShapeStepRowsUnit.tsx` so this file stays about ordering and truncation.
 */
import { useState } from "react";

import { groupDynamicRuntimeRows } from "~/t3team/chat/t3team-workflowShapeStepGrouping";
import {
  stepUnitKey,
  T3TeamWorkflowShapeStepUnit,
} from "~/t3team/chat/t3team-workflowShapeStepRowsUnit";
import {
  topLevelStepVisibility,
  WORKFLOW_TOP_PAGE_SIZE,
} from "~/t3team/chat/t3team-workflowShapeStepRowsPaging";
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
  const [revealedMiddleCount, setRevealedMiddleCount] = useState(0);

  // Render each authored phase as exactly ONE group. `reconcileT3TeamWorkflowShapeProgress` places
  // a dynamic row at its nearest-prior-matched-plan-step anchor — that is display order — while
  // the phase it reports now comes from the server's `workflowPhase` stamp. The two can disagree:
  // a stamped 'Analyse' row can sit after the 'Summarise' plan rows, which made the 'Analyse'
  // header render a second time (observed live 2026-08-29 on `parallel(items.map(...))`). Bucket
  // ROWS by phase first (keeping each phase's first-appearance order and each row's order within
  // it), then group within each phase — so same-label repeats that the anchor placement scattered
  // across the plan rows (a `parallel()` fan-out, GHE #407) still fold into one group, and the
  // `priorPlanPhase` walk below emits one header per phase.
  const orderedUnits = (() => {
    const byPhase = new Map<string, LiveState["rows"][number][]>();
    for (const row of rows) {
      const key = row.planStep?.phase ?? row.phase ?? "Current work";
      const bucket = byPhase.get(key);
      if (bucket) bucket.push(row);
      else byPhase.set(key, [row]);
    }
    // `unit.index` must stay the row's position in the FULL list (the scheduled/pending walk
    // below reads it), not its position inside the phase bucket.
    const originalIndex = new Map(rows.map((row, index) => [row, index] as const));
    return [...byPhase.values()].flatMap((bucket) =>
      groupDynamicRuntimeRows(bucket).map((unit) =>
        unit.kind === "row" ? { ...unit, index: originalIndex.get(unit.row) ?? unit.index } : unit,
      ),
    );
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

  const { truncated, headEnd, tailStart, hiddenCount } = topLevelStepVisibility(
    orderedUnits.length,
    revealedMiddleCount,
  );

  return (
    <div className="mt-3 space-y-1.5">
      {(() => {
        let priorPlanPhase: string | null = null;
        return orderedUnits.flatMap((unit, index) => {
          const firstRow = unit.kind === "row" ? unit.row : unit.rows[0]!;
          const phaseTitle = firstRow.planStep?.phase ?? firstRow.phase ?? "Current work";
          const showPhaseHeader = phaseTitle !== null && phaseTitle !== priorPlanPhase;
          if (phaseTitle !== null) priorPlanPhase = phaseTitle;

          // A folded entry still updates `priorPlanPhase` above, so the tail's headers dedup
          // correctly against phases the reader can't see, but renders nothing itself — except
          // the affordance, once, right where the head slice ends.
          if (truncated && index >= headEnd && index < tailStart) {
            if (index !== headEnd) return [];
            return [
              <button
                key="workflow-steps-earlier"
                type="button"
                data-workflow-steps-earlier={hiddenCount}
                className="rounded px-1 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setRevealedMiddleCount((count) => count + WORKFLOW_TOP_PAGE_SIZE)}
              >
                … {hiddenCount} earlier
              </button>,
            ];
          }

          const phaseHeader = showPhaseHeader ? (
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65">
              {phaseTitle}
            </p>
          ) : null;
          return [
            <T3TeamWorkflowShapeStepUnit
              key={stepUnitKey(unit)}
              unit={unit}
              phaseHeader={phaseHeader}
              status={status}
              scheduledPlanRow={scheduledPlanRow}
              activeWaitAt={activeWaitAt}
              dynamicPhaseTitles={dynamicPhaseTitles}
              {...(childStatuses ? { childStatuses } : {})}
              {...(onOpenThread ? { onOpenThread } : {})}
              {...(currentThreadId ? { currentThreadId } : {})}
            />,
          ];
        });
      })()}
    </div>
  );
}
