import { describe, expect, it } from "vite-plus/test";

import { reconcileT3workWorkflowShapeProgress } from "./t3work-workflowShapeProgress";

const runtimeStep = (stepKind: string, phase: "completed" | "waiting", seq: number) => ({
  stepId: `run:${seq}`,
  seq,
  stepKind,
  phase,
});

describe("reconcileT3workWorkflowShapeProgress", () => {
  it("hides infrastructure steps without marking future plan rows complete", () => {
    const result = reconcileT3workWorkflowShapeProgress(
      [
        { phase: "Work", kind: "agent", label: "First agent" },
        { phase: "Decide", kind: "ask", label: "Approve?" },
        { phase: "Finish", kind: "agent", label: "Synthesize" },
      ],
      [runtimeStep("thread.create", "completed", 1), runtimeStep("thread.turn", "completed", 2)],
    );

    expect(result.planSteps.map((step) => step?.phase)).toEqual([
      "completed",
      undefined,
      undefined,
    ]);
    expect(result.rows.map((row) => row.runtimeStep?.stepKind)).toEqual([
      "thread.turn",
      undefined,
      undefined,
    ]);
    expect(result.rows.some((row) => row.runtimeStep?.stepKind === "thread.create")).toBe(false);
  });

  it("maps a waiting user input to the ask row and leaves synthesis pending", () => {
    const result = reconcileT3workWorkflowShapeProgress(
      [
        { phase: "Work", kind: "agent", label: "First agent" },
        { phase: "Decide", kind: "ask", label: "Approve?" },
        { phase: "Finish", kind: "agent", label: "Synthesize" },
      ],
      [runtimeStep("thread.turn", "completed", 1), runtimeStep("user.input", "waiting", 2)],
    );

    expect(result.planSteps.map((step) => step?.phase)).toEqual([
      "completed",
      "waiting",
      undefined,
    ]);
  });

  it("keeps unknown runtime steps at their journal position", () => {
    const result = reconcileT3workWorkflowShapeProgress(
      [
        { phase: "Work", kind: "agent", label: "Investigate" },
        { phase: "Finish", kind: "act", label: "Publish result" },
      ],
      [
        runtimeStep("thread.turn", "completed", 1),
        runtimeStep("custom.operation", "completed", 2),
        runtimeStep("act", "completed", 3),
      ],
    );

    expect(result.rows.map((row) => row.planStep?.label ?? row.runtimeStep?.stepKind)).toEqual([
      "Investigate",
      "custom.operation",
      "Publish result",
    ]);
  });
});
