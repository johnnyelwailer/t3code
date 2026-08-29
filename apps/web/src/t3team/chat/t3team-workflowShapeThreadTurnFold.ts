/**
 * Fold contiguous runtime rows that are really the SAME live conversation into one row.
 *
 * A child thread whose agent gets asked more than once journals one `thread.turn` activity per
 * ask (see `t3team-threadWorkflowStepProgress.ts`). Reconciling against the authored plan
 * (`t3team-workflowShapeProgress.ts`) matches only the FIRST such turn to its plan row — every
 * later turn on the same thread has no plan row left and falls through as an unmatched (dynamic)
 * row. Without this fold, that renders as TWO rows with the identical label: one settled, one
 * still spinning — the exact bug reported live 2026-08-29 on a QA sub-thread asked twice.
 *
 * Fold predicate — all three required (PJ's refinement on the original report):
 *   1. same non-empty `runtimeStep.threadId`;
 *   2. same displayed label (the authored plan label when matched, else `fallbackRuntimeLabel`);
 *   3. ADJACENT in the underlying runtime-event order — no other visible runtime step (a
 *      different thread, a different label, a script/ask/wait step, ...) ran in between.
 *
 * Two turns on the same thread that are NOT adjacent mean the workflow left this agent, did other
 * visible work, and came back later — folding those would hide that gap, so they stay two rows.
 * A not-yet-reached plan row (no `runtimeStep` at all) hasn't run, so it is transparent to
 * adjacency: it cannot be "something that happened in between" two turns.
 *
 * Call this on the fully reconciled row list, before anything downstream computes a position
 * against it (`groupDynamicRuntimeRows`'s by-label fold, the scheduled-wait row lookup) — those
 * must see the SAME positions the fold produces.
 */
import type { T3TeamWorkflowShapeProgressRow } from "~/t3team/chat/t3team-workflowShapeProgress";
import { fallbackRuntimeLabel } from "~/t3team/chat/t3team-workflowRunStepRow";

function normalizeLabel(label: string): string {
  return label.replaceAll(/\s+/g, " ").trim().toLowerCase();
}

function displayedRowLabel(row: T3TeamWorkflowShapeProgressRow): string {
  return normalizeLabel(row.planStep?.label ?? fallbackRuntimeLabel(row.runtimeStep!));
}

export function foldAdjacentThreadTurnRows(
  rows: ReadonlyArray<T3TeamWorkflowShapeProgressRow>,
): T3TeamWorkflowShapeProgressRow[] {
  const output: T3TeamWorkflowShapeProgressRow[] = [];
  // Tracks the open fold chain: which output slot it merges into, the thread/label it must keep
  // matching, and how many `thread.turn` activities have folded into it so far.
  let active: { outIndex: number; threadId: string; label: string; turnCount: number } | null =
    null;

  for (const row of rows) {
    const step = row.runtimeStep;
    if (step === undefined) {
      // Not-yet-reached plan row — no runtime event happened, so it can't break adjacency.
      output.push(row);
      continue;
    }
    const threadId = step.threadId;
    const foldable = threadId !== undefined && threadId !== "";
    const label = displayedRowLabel(row);
    const isTurn = step.stepKind === "thread.turn";

    if (active !== null && foldable && threadId === active.threadId && label === active.label) {
      const merged = output[active.outIndex]!;
      const turnCount = active.turnCount + (isTurn ? 1 : 0);
      // `exactOptionalPropertyTypes` treats an explicit `undefined` as a set value, not an absent
      // one — build each optional field with a conditional spread rather than `field: maybeUndefined`.
      const mergedPlanStep = merged.planStep ?? row.planStep;
      const mergedPhase = row.phase !== undefined ? row.phase : merged.phase;
      output[active.outIndex] = {
        ...(mergedPlanStep !== undefined ? { planStep: mergedPlanStep } : {}),
        ...(mergedPhase !== undefined ? { phase: mergedPhase } : {}),
        // Latest turn wins entirely (status, detail, durationMs, ...) — a `started` turn must
        // read as running even though an earlier turn on this thread already completed. Folded
        // turns' durations are NOT summed; only the latest turn's `durationMs` is kept, which is
        // the number that matches what someone watching the run would expect to see change.
        runtimeStep: turnCount >= 2 ? { ...step, turnCount } : step,
      };
      active.turnCount = turnCount;
      continue;
    }

    output.push(row);
    active = foldable
      ? { outIndex: output.length - 1, threadId, label, turnCount: isTurn ? 1 : 0 }
      : null;
  }

  return output;
}
