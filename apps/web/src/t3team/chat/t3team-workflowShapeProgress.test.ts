import { describe, expect, it } from "vite-plus/test";

import { reconcileT3TeamWorkflowShapeProgress } from "./t3team-workflowShapeProgress";

const runtimeStep = (stepKind: string, phase: "completed" | "waiting", seq: number) => ({
  stepId: `run:${seq}`,
  seq,
  stepKind,
  phase,
  updatedAt: "2026-07-19T12:00:00.000Z",
});

describe("reconcileT3TeamWorkflowShapeProgress", () => {
  it("hides infrastructure steps without marking future plan rows complete", () => {
    const result = reconcileT3TeamWorkflowShapeProgress(
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
    const result = reconcileT3TeamWorkflowShapeProgress(
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
    const result = reconcileT3TeamWorkflowShapeProgress(
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
    const result = reconcileT3TeamWorkflowShapeProgress(
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
    const result = reconcileT3TeamWorkflowShapeProgress(
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
    const result = reconcileT3TeamWorkflowShapeProgress(
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

  it("buckets a parallel() fan-out of dynamic agent calls under its OWN authored phase, not the next matched plan step's", () => {
    // The exact reported scenario: one `parallel()` of three dynamic `agent()` calls runs
    // entirely under the first authored phase, and `phase('Synthesize')` only fires after that
    // `parallel()` resolves. Before the server stamped `workflowPhase`, two of the three dynamic
    // rows anchored to whichever plan step matched next and rendered under "Synthesize" instead.
    const result = reconcileT3TeamWorkflowShapeProgress(
      [
        { phase: "Review", kind: "agent", label: "Agent turn" },
        { phase: "Synthesize", kind: "agent", label: "Merge into ranked report" },
      ],
      [
        {
          ...runtimeStep("thread.turn", "completed", 1),
          detail: "Review correctness",
          workflowPhase: "Review",
        },
        {
          ...runtimeStep("thread.turn", "completed", 2),
          detail: "Review edge cases",
          workflowPhase: "Review",
        },
        {
          ...runtimeStep("thread.turn", "completed", 3),
          detail: "Review API design",
          workflowPhase: "Review",
        },
        {
          ...runtimeStep("thread.turn", "completed", 4),
          detail: "Merge into ranked report",
          workflowPhase: "Synthesize",
        },
      ],
    );

    const reviewDetails = ["Review correctness", "Review edge cases", "Review API design"];
    const dynamicRows = result.rows.filter((row) =>
      reviewDetails.includes(row.runtimeStep?.detail ?? ""),
    );
    expect(dynamicRows).toHaveLength(3);
    expect(dynamicRows.map((row) => row.phase)).toEqual(["Review", "Review", "Review"]);

    const mergeRow = result.rows.find((row) => row.runtimeStep?.detail === "Merge into ranked report");
    expect(mergeRow?.planStep?.label).toBe("Merge into ranked report");
  });

  it("falls back to the nearest-prior-match heuristic when a runtime step carries no workflowPhase stamp (older runs)", () => {
    const result = reconcileT3TeamWorkflowShapeProgress(
      [
        { phase: "Review", kind: "agent", label: "Agent turn" },
        { phase: "Synthesize", kind: "agent", label: "Merge into ranked report" },
      ],
      [
        { ...runtimeStep("thread.turn", "completed", 1), detail: "Review correctness" },
        { ...runtimeStep("thread.turn", "completed", 4), detail: "Merge into ranked report" },
      ],
    );

    const dynamicRow = result.rows.find((row) => row.runtimeStep?.detail === "Review correctness");
    expect(dynamicRow?.phase).toBe("Review");
  });

  it("matches scheduled runtime work to an authored wait row", () => {
    const result = reconcileT3TeamWorkflowShapeProgress(
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
