/**
 * Regression coverage for the reported bug: a live orchestration card rendered TWO rows with the
 * identical label "Independent QA & live verification" — one completed, one still spinning —
 * because `reconcileT3TeamWorkflowShapeProgress` matched only the FIRST turn on a re-asked child
 * thread to its plan row, leaving the SECOND turn to fall through as an unmatched dynamic row.
 * `foldAdjacentThreadTurnRows` folds both back into one row keyed by child thread, not turn.
 */
import { describe, expect, it } from "vite-plus/test";

import { foldAdjacentThreadTurnRows } from "~/t3team/chat/t3team-workflowShapeThreadTurnFold";
import { reconcileT3TeamWorkflowShapeProgress } from "~/t3team/chat/t3team-workflowShapeProgress";
import type { T3TeamWorkflowShapeProgressRow } from "~/t3team/chat/t3team-workflowShapeProgress";
import type { T3TeamWorkflowStepEntry } from "~/t3team/chat/t3team-threadWorkflowStepProgress";

function turnRow(input: {
  stepId: string;
  phase: T3TeamWorkflowStepEntry["phase"];
  threadId?: string;
  stepKind?: string;
  detail?: string;
}): T3TeamWorkflowShapeProgressRow {
  return {
    runtimeStep: {
      stepId: input.stepId,
      seq: null,
      stepKind: input.stepKind ?? "thread.turn",
      phase: input.phase,
      ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
      ...(input.detail !== undefined ? { detail: input.detail } : {}),
    },
  };
}

describe("foldAdjacentThreadTurnRows", () => {
  it("folds two adjacent turns on the same child thread into one row showing the latest state", () => {
    const rows = [
      turnRow({ stepId: "run:4", phase: "completed", threadId: "child:3", detail: "QA" }),
      turnRow({ stepId: "run:5", phase: "started", threadId: "child:3", detail: "QA" }),
    ];

    const folded = foldAdjacentThreadTurnRows(rows);

    expect(folded).toHaveLength(1);
    expect(folded[0]!.runtimeStep?.phase).toBe("started");
    expect(folded[0]!.runtimeStep?.stepId).toBe("run:5");
    expect(folded[0]!.runtimeStep?.turnCount).toBe(2);
  });

  it("leaves a single-turn step unchanged with no turn count", () => {
    const rows = [turnRow({ stepId: "run:1", phase: "completed", threadId: "child:1" })];

    const folded = foldAdjacentThreadTurnRows(rows);

    expect(folded).toHaveLength(1);
    expect(folded[0]!.runtimeStep?.turnCount).toBeUndefined();
  });

  it("keeps two DIFFERENT child threads as two rows even with the same label", () => {
    const rows = [
      turnRow({ stepId: "run:1", phase: "completed", threadId: "child:1", detail: "Same label" }),
      turnRow({ stepId: "run:2", phase: "started", threadId: "child:2", detail: "Same label" }),
    ];

    const folded = foldAdjacentThreadTurnRows(rows);

    expect(folded).toHaveLength(2);
    expect(folded.every((row) => row.runtimeStep?.turnCount === undefined)).toBe(true);
  });

  it("leaves steps with no threadId (script/wait/ask) completely untouched", () => {
    const rows: T3TeamWorkflowShapeProgressRow[] = [
      turnRow({ stepId: "run:1", phase: "completed", stepKind: "act" }),
      turnRow({ stepId: "run:2", phase: "waiting", stepKind: "user.input" }),
    ];

    const folded = foldAdjacentThreadTurnRows(rows);

    expect(folded).toEqual(rows);
  });

  it("does NOT fold across a non-adjacent repeat: an unrelated step in between keeps two rows", () => {
    // Same child thread, same label, but a different step ran in between — the workflow left this
    // agent, did other visible work, and came back. That gap is information the fold must not hide.
    const rows = [
      turnRow({ stepId: "run:1", phase: "completed", threadId: "child:3", detail: "QA" }),
      turnRow({ stepId: "run:2", phase: "completed", stepKind: "act", detail: "Unrelated act" }),
      turnRow({ stepId: "run:3", phase: "started", threadId: "child:3", detail: "QA" }),
    ];

    const folded = foldAdjacentThreadTurnRows(rows);

    expect(folded).toHaveLength(3);
    expect(folded.every((row) => row.runtimeStep?.turnCount === undefined)).toBe(true);
  });

  it("does not let a not-yet-reached plan row (no runtimeStep) break adjacency", () => {
    const rows: T3TeamWorkflowShapeProgressRow[] = [
      turnRow({ stepId: "run:1", phase: "completed", threadId: "child:3", detail: "QA" }),
      { planStep: { phase: "Finish", kind: "agent", label: "Synthesize" } },
      turnRow({ stepId: "run:2", phase: "started", threadId: "child:3", detail: "QA" }),
    ];

    const folded = foldAdjacentThreadTurnRows(rows);

    // The unstarted "Synthesize" plan row stays in place; the two QA turns still fold together.
    expect(folded).toHaveLength(2);
    const qaRow = folded.find((row) => row.runtimeStep !== undefined);
    expect(qaRow?.runtimeStep?.turnCount).toBe(2);
    expect(qaRow?.runtimeStep?.phase).toBe("started");
  });

  it("folds the reported cross-set case: a plan-matched turn plus a later dynamic turn on the same thread", () => {
    // The exact seq table from the live bug report: seq 4 (thread.turn, completed) matches the
    // authored "Independent QA & live verification" plan row; seq 5 (thread.turn, started) is a
    // second ask of the SAME child thread and has no plan row left, so it falls through as
    // dynamic. `thread.create` at seq 3 never becomes a row at all (reconcile hides it).
    const label = "Independent QA & live verification";
    const result = reconcileT3TeamWorkflowShapeProgress(
      [
        { phase: "Implement", kind: "agent", label: "Implement feature" },
        { phase: "QA", kind: "agent", label },
      ],
      [
        {
          stepId: "run:1",
          seq: 1,
          stepKind: "thread.create",
          phase: "completed",
          threadId: "child:1",
        },
        {
          stepId: "run:2",
          seq: 2,
          stepKind: "thread.turn",
          phase: "completed",
          threadId: "child:1",
          detail: "Implement feature",
        },
        {
          stepId: "run:3",
          seq: 3,
          stepKind: "thread.create",
          phase: "completed",
          threadId: "child:3",
        },
        {
          stepId: "run:4",
          seq: 4,
          stepKind: "thread.turn",
          phase: "completed",
          threadId: "child:3",
          detail: label,
        },
        {
          stepId: "run:5",
          seq: 5,
          stepKind: "thread.turn",
          phase: "started",
          threadId: "child:3",
          detail: label,
        },
      ],
    );

    // Before the fold: the bug reproduces — two rows share the label.
    const qaRowsBeforeFold = result.rows.filter(
      (row) => (row.planStep?.label ?? row.runtimeStep?.detail) === label,
    );
    expect(qaRowsBeforeFold).toHaveLength(2);

    const folded = foldAdjacentThreadTurnRows(result.rows);

    const qaRowsAfterFold = folded.filter(
      (row) => (row.planStep?.label ?? row.runtimeStep?.detail) === label,
    );
    expect(qaRowsAfterFold).toHaveLength(1);
    expect(qaRowsAfterFold[0]!.planStep?.label).toBe(label);
    expect(qaRowsAfterFold[0]!.runtimeStep?.phase).toBe("started");
    expect(qaRowsAfterFold[0]!.runtimeStep?.turnCount).toBe(2);
    expect(qaRowsAfterFold[0]!.runtimeStep?.stepId).toBe("run:5");
  });
});
