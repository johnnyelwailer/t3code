/**
 * The collapsible form of a dynamic same-label group (four or more repeats — a loop body calling
 * the same agent step once per item). Split out of `t3team-workflowShapeStepGrouping.tsx`, which
 * owns the grouping decision and the small-group (retry-badge) form.
 *
 * A group is CAPPED at {@link WORKFLOW_GROUP_VISIBLE_ROWS} rendered rows until the reader asks for
 * all of them (GHE #403 §5): an overnight `while (true)` loop calling `agent()` per iteration is
 * hundreds of rows, and rendering every one of them for a card nobody scrolls is DOM for nothing.
 */
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { T3TeamWorkflowStepDetails } from "~/t3team/chat/t3team-WorkflowStepDetails";
import {
  RuntimeStepRow,
  StepStatusIcon,
  type StepStatus,
} from "~/t3team/chat/t3team-workflowRunStepRow";
import type { useT3TeamWorkflowShapeLiveState } from "~/t3team/chat/t3team-workflowShapeLiveState";
import type { DynamicRow } from "~/t3team/chat/t3team-workflowShapeStepGrouping";

type LiveState = ReturnType<typeof useT3TeamWorkflowShapeLiveState>;

/** How many rows of a collapsible group render before the "Show all N" expander. */
export const WORKFLOW_GROUP_VISIBLE_ROWS = 10;

/**
 * The rows a collapsible group renders: the LAST {@link WORKFLOW_GROUP_VISIBLE_ROWS} until the
 * reader expands, then all of them. The last rows are kept — not the first — because the newest
 * row (the live/failed iteration in a loop) is always at the end, and it must stay visible rather
 * than hiding behind "Show all N" (GHE #406). Pure so the cap can be asserted without rendering.
 */
export function visibleGroupRows<Row>(
  rows: readonly Row[],
  showAll: boolean,
): { readonly visible: readonly Row[]; readonly hidden: number } {
  if (showAll || rows.length <= WORKFLOW_GROUP_VISIBLE_ROWS) return { visible: rows, hidden: 0 };
  return {
    visible: rows.slice(rows.length - WORKFLOW_GROUP_VISIBLE_ROWS),
    hidden: rows.length - WORKFLOW_GROUP_VISIBLE_ROWS,
  };
}

export function T3TeamWorkflowShapeCollapsedGroup({
  label,
  rows,
  icon,
  completed,
  status,
  childStatuses,
  onOpenThread,
  currentThreadId,
}: {
  readonly label: string;
  readonly rows: readonly DynamicRow[];
  readonly icon: StepStatus;
  readonly completed: number;
  readonly status: LiveState["status"];
  readonly childStatuses?: Readonly<Record<string, string>>;
  readonly onOpenThread?: (input: { projectId: string; threadId: string }) => void;
  readonly currentThreadId?: string | undefined;
}) {
  const [showAll, setShowAll] = useState(false);
  const { visible, hidden } = visibleGroupRows(rows, showAll);
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
        {hidden > 0 ? (
          <button
            type="button"
            data-step-group-show-all={rows.length}
            className="rounded px-1 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setShowAll(true)}
          >
            Show all {rows.length}
          </button>
        ) : null}
        {visible.map((row) => (
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
