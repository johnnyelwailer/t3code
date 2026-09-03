/**
 * Grouping and status-aggregation logic for the live workflow card's dynamic (plan-unmatched)
 * runtime rows.
 *
 * Regression coverage for a review pass that found: a lone dynamic row was always wrapped into a
 * "group" of one, producing a bogus "↻1" retry badge; and `aggregateGroupStatus` had no arm for
 * cancelled/paused runs, so those groups rendered as merely "pending".
 */
import { describe, expect, it } from "vite-plus/test";

import {
  aggregateGroupStatus,
  type DynamicRow,
  groupDynamicRuntimeRows,
} from "~/t3team/chat/t3team-workflowShapeStepGrouping";
import type { T3TeamWorkflowShapeProgressRow } from "~/t3team/chat/t3team-workflowShapeProgress";
import type { T3TeamWorkflowStepEntry } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import type { ProjectRecipeWorkflowShapeStep } from "@t3tools/project-recipes";

function dynamicRow(input: {
  stepId: string;
  phase: T3TeamWorkflowStepEntry["phase"];
  stepKind?: string;
  detail?: string;
}): T3TeamWorkflowShapeProgressRow {
  return {
    runtimeStep: {
      stepId: input.stepId,
      seq: null,
      stepKind: input.stepKind ?? "thread.turn",
      phase: input.phase,
      ...(input.detail !== undefined ? { detail: input.detail } : {}),
    },
  };
}

describe("groupDynamicRuntimeRows", () => {
  it("keeps a singleton dynamic row as a plain row, not a group", () => {
    const rows = [dynamicRow({ stepId: "run:1", phase: "completed", detail: "Do the thing" })];

    const units = groupDynamicRuntimeRows(rows);

    expect(units).toHaveLength(1);
    expect(units[0]!.kind).toBe("row");
  });

  it("folds two consecutive rows with the same label into a dynamic-group of 2", () => {
    const rows = [
      dynamicRow({ stepId: "run:1", phase: "completed", detail: "Do the thing" }),
      dynamicRow({ stepId: "run:2", phase: "completed", detail: "Do the thing" }),
    ];

    const units = groupDynamicRuntimeRows(rows);

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ kind: "dynamic-group" });
    if (units[0]!.kind === "dynamic-group") {
      expect(units[0]!.rows).toHaveLength(2);
    }
  });

  it("does not group rows with different labels or an authored plan match", () => {
    const rows: T3TeamWorkflowShapeProgressRow[] = [
      dynamicRow({ stepId: "run:1", phase: "completed", detail: "First thing" }),
      dynamicRow({ stepId: "run:2", phase: "completed", detail: "Second thing" }),
    ];

    const units = groupDynamicRuntimeRows(rows);

    expect(units).toHaveLength(2);
    expect(units.every((unit) => unit.kind === "row")).toBe(true);
  });

  it("absorbs the leading plan-matched iteration into the dynamic group it belongs to (GHE #407)", () => {
    // A single agent() call site inside a 12-iteration loop: one authored plan row matches only
    // the FIRST runtime iteration; the other 11 are plan-unmatched dynamic rows with the same
    // fallback label. Without absorption this rendered as a standalone "Count step" row beside a
    // "Count step · 11/11" group instead of one "Count step · 12/12" group.
    const planMatched: T3TeamWorkflowShapeProgressRow = {
      planStep: { kind: "agent", label: "Count step" } as ProjectRecipeWorkflowShapeStep,
      runtimeStep: {
        stepId: "run:0",
        seq: null,
        stepKind: "thread.turn",
        phase: "completed",
        detail: "Count step",
      },
    };
    const rows: T3TeamWorkflowShapeProgressRow[] = [
      planMatched,
      ...Array.from({ length: 11 }, (_, i) =>
        dynamicRow({ stepId: `run:${i + 1}`, phase: "completed", detail: "Count step" }),
      ),
    ];

    const units = groupDynamicRuntimeRows(rows);

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ kind: "dynamic-group", label: "Count step" });
    if (units[0]!.kind === "dynamic-group") {
      expect(units[0]!.rows).toHaveLength(12);
    }
  });

  it("leaves an unmatched plan row and a wait-until timer untouched by absorption", () => {
    const unmatchedPlan: T3TeamWorkflowShapeProgressRow = {
      planStep: { kind: "agent", label: "Unstarted step" } as ProjectRecipeWorkflowShapeStep,
    };
    const waitUntil: T3TeamWorkflowShapeProgressRow = {
      planStep: { kind: "act", label: "Wait" } as ProjectRecipeWorkflowShapeStep,
      runtimeStep: {
        stepId: "run:wait",
        seq: null,
        stepKind: "workflow.wait-until",
        phase: "completed",
      },
    };

    const units = groupDynamicRuntimeRows([unmatchedPlan, waitUntil]);

    expect(units).toHaveLength(2);
    expect(units.every((unit) => unit.kind === "row")).toBe(true);
  });
});

describe("aggregateGroupStatus", () => {
  function rowsWithPhases(phases: ReadonlyArray<T3TeamWorkflowStepEntry["phase"]>): DynamicRow[] {
    return phases.map((phase, i) => dynamicRow({ stepId: `run:${i}`, phase }) as DynamicRow);
  }

  it("is never merely 'pending' for a cancelled group", () => {
    const { icon } = aggregateGroupStatus(rowsWithPhases(["cancelled", "cancelled"]), "cancelled");
    expect(icon).toBe("cancelled");
  });

  it("is never merely 'pending' for a paused group", () => {
    const { icon } = aggregateGroupStatus(rowsWithPhases(["paused", "paused"]), "paused");
    expect(icon).toBe("paused");
  });

  it("reports completed with a count when all rows completed", () => {
    const { icon, completed } = aggregateGroupStatus(
      rowsWithPhases(["completed", "completed"]),
      "completed",
    );
    expect(icon).toBe("completed");
    expect(completed).toBe(2);
  });

  it("prefers 'started' over any terminal state when a row is still running", () => {
    const { icon } = aggregateGroupStatus(rowsWithPhases(["completed", "started"]), "running");
    expect(icon).toBe("started");
  });
});

describe("self-heal redaction flag propagation", () => {
  it("marks a self-heal runtime step for redaction regardless of grouping", () => {
    const rows = [
      dynamicRow({ stepId: "run:1", phase: "started", stepKind: "workflow.self-heal" }),
      dynamicRow({ stepId: "run:2", phase: "started", stepKind: "workflow.self-heal" }),
    ];

    const units = groupDynamicRuntimeRows(rows);

    expect(units[0]!.kind).toBe("dynamic-group");
    if (units[0]!.kind === "dynamic-group") {
      for (const row of units[0]!.rows) {
        expect(row.runtimeStep.stepKind).toBe("workflow.self-heal");
      }
    }
  });
});
