import { describe, expect, it } from "vite-plus/test";

import { reconcileT3workWorkflowShapeProgress } from "./t3work-workflowShapeProgress";

const runtimeStep = (stepKind: string, phase: "completed" | "waiting", seq: number) => ({
  stepId: `run:${seq}`,
  seq,
  stepKind,
  phase,
  updatedAt: "2026-07-19T12:00:00.000Z",
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

  it("does not map repeated labelled parallel turns onto a future phase", () => {
    const result = reconcileT3workWorkflowShapeProgress(
      [
        { phase: "Parallel review", kind: "agent", label: "Review change" },
        { phase: "Synthesis", kind: "agent", label: "Write summary" },
      ],
      [
        { ...runtimeStep("thread.turn", "completed", 1), detail: "Review change" },
        { ...runtimeStep("thread.turn", "completed", 2), detail: "Review change" },
      ],
    );

    expect(result.planSteps.map((step) => step?.detail)).toEqual(["Review change", undefined]);
    expect(result.rows.map((row) => row.planStep?.label ?? row.runtimeStep?.detail)).toEqual([
      "Review change",
      "Review change",
      "Write summary",
    ]);
  });

  it("keeps an unlabeled agent turn under the first authored phase", () => {
    const result = reconcileT3workWorkflowShapeProgress(
      [{ phase: "DEMO", kind: "agent", label: "Reply OK" }],
      [{ ...runtimeStep("thread.turn", "waiting", 1), detail: "Reply only with OK." }],
    );

    expect(result.planSteps).toEqual([undefined]);
    expect(result.rows).toEqual([
      expect.objectContaining({
        runtimeStep: expect.objectContaining({ detail: "Reply only with OK." }),
        phase: "DEMO",
      }),
      expect.objectContaining({ planStep: expect.objectContaining({ label: "Reply OK" }) }),
    ]);
  });

  it("matches a legacy prompt that starts with the authored label", () => {
    const result = reconcileT3workWorkflowShapeProgress(
      [{ phase: "DEMO", kind: "agent", label: "Reply OK" }],
      [
        {
          ...runtimeStep("thread.turn", "waiting", 1),
          detail: "Reply OK Respond with ONLY a single JSON value matching the required schema.",
        },
      ],
    );

    expect(result.rows).toEqual([
      expect.objectContaining({
        planStep: expect.objectContaining({ label: "Reply OK" }),
        runtimeStep: expect.objectContaining({ stepKind: "thread.turn" }),
      }),
    ]);
  });

  it("matches scheduled runtime work to an authored wait row", () => {
    const result = reconcileT3workWorkflowShapeProgress(
      [{ phase: "Review", kind: "agent", label: "Wait for review window" }],
      [{ ...runtimeStep("wait.until", "waiting", 1), detail: "2026-07-20T09:00:00.000Z" }],
    );

    expect(result.rows).toEqual([
      expect.objectContaining({
        planStep: expect.objectContaining({ label: "Wait for review window" }),
        runtimeStep: expect.objectContaining({ stepKind: "wait.until" }),
      }),
    ]);
  });
});
