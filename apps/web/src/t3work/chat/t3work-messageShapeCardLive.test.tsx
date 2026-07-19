// @vitest-environment jsdom
import { EventId } from "@t3tools/contracts";
import { PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP } from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";
import { deriveT3workWorkflowStepRuns } from "~/t3work/chat/t3work-threadWorkflowStepProgress";
import {
  countOccurrences,
  renderTimeline,
  RUN_ID,
  runActivity,
  step,
  stepActivity,
} from "~/t3work/chat/t3work-messageShapeCardLive.testSupport";

describe("deriveT3workWorkflowStepRuns", () => {
  it("groups by run, orders by journal seq, keeps the latest phase, and splits the run row", () => {
    const activities = [
      stepActivity(step(2, "user.input", "waiting", { detail: "Merge it?" }), { sequence: 3 }),
      stepActivity(step(1, "thread.turn", "started"), { sequence: 1 }),
      stepActivity(step(1, "thread.turn", "completed"), { sequence: 2 }),
      stepActivity(
        {
          workflowRunId: "run-other",
          stepId: "run-other:1",
          stepKind: "thread.turn",
          phase: "started",
        },
        { sequence: 4 },
      ),
      runActivity("completed"),
    ];

    const runs = deriveT3workWorkflowStepRuns(activities);
    expect([...runs.keys()].toSorted()).toEqual([RUN_ID, "run-other"]);

    const run = runs.get(RUN_ID);
    expect(run?.steps.map((entry) => entry.stepId)).toEqual([`${RUN_ID}:1`, `${RUN_ID}:2`]);
    // latest phase wins for the re-emitted step
    expect(run?.steps[0]?.phase).toBe("completed");
    expect(run?.steps[1]?.phase).toBe("waiting");
    expect(run?.steps[1]?.detail).toBe("Merge it?");
    // the run-level terminal activity is NOT a step row
    expect(run?.run).toEqual({ phase: "completed" });
    expect(runs.get("run-other")?.run).toBeNull();
  });

  it("ignores non-step activities and malformed payloads", () => {
    const runs = deriveT3workWorkflowStepRuns([
      {
        id: EventId.make("activity-other"),
        tone: "info",
        kind: "tool.started",
        summary: "something else",
        payload: { hello: "world" },
        turnId: null,
        createdAt: "2026-07-17T10:00:00.000Z",
      },
      {
        id: EventId.make("activity-bad"),
        tone: "info",
        kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
        summary: "bad payload",
        payload: { nope: true },
        turnId: null,
        createdAt: "2026-07-17T10:00:01.000Z",
      },
    ]);
    expect(runs.size).toBe(0);
  });
});

describe("live workflow step overlay on the plan card", () => {
  it("overlays plan steps with live statuses and keeps unexecuted steps neutral", async () => {
    const markup = await renderTimeline([
      stepActivity(step(1, "read", "completed", { detail: "github.pullRequest.get" }), {
        sequence: 1,
      }),
      stepActivity(step(2, "thread.turn", "started"), { sequence: 2 }),
    ]);

    // workflow chrome still owns the card
    expect(markup).toContain("shape.pr-review");
    expect(markup).not.toContain("The plan");
    expect(markup).not.toContain(">System<");
    // step 1 completed, step 2 running, steps 3+4 not executed yet
    expect(countOccurrences(markup, 'data-step-status="completed"')).toBe(1);
    expect(countOccurrences(markup, 'data-step-status="started"')).toBe(1);
    expect(countOccurrences(markup, 'data-step-status="pending"')).toBe(2);
    // Executed summaries and pending rows share the exact inset, so every status icon lines up.
    expect(countOccurrences(markup, 'data-step-row-shell="interactive"')).toBe(2);
    expect(countOccurrences(markup, 'data-step-row-shell="static"')).toBe(2);
    expect(countOccurrences(markup, "rounded-md px-1 py-0.5")).toBe(4);
    // run not terminal yet — no banner
    expect(markup).not.toContain("data-run-status");
  }, 30000);

  it("keeps work logs inside expandable steps and links child threads", async () => {
    const markup = await renderTimeline(
      [
        stepActivity(
          step(1, "thread.turn", "completed", {
            detail: "Reviewed the implementation",
            projectId: "project-1",
            threadId: "child-1",
          }),
        ),
      ],
      () => {},
    );

    expect(markup).toContain("<details");
    expect(markup).toContain("Work log");
    expect(markup).toContain("Reviewed the implementation");
    expect(markup).toContain("Open thread");
  }, 30000);

  it("renders waiting and failed statuses without duplicating the ask content", async () => {
    const markup = await renderTimeline([
      stepActivity(step(1, "read", "completed"), { sequence: 1 }),
      stepActivity(step(2, "thread.turn", "completed"), { sequence: 2 }),
      stepActivity(step(3, "user.input", "waiting", { detail: "Merge it?" }), { sequence: 3 }),
      stepActivity(step(4, "act", "failed", { error: "merge conflict" }), { sequence: 4 }),
    ]);

    expect(countOccurrences(markup, 'data-step-status="completed"')).toBe(2);
    expect(countOccurrences(markup, 'data-step-status="waiting"')).toBe(1);
    expect(countOccurrences(markup, 'data-step-status="failed"')).toBe(1);
    // the waiting row shows only status — the ask question is the decision card's job
    expect(countOccurrences(markup, "Merge it?")).toBe(1); // the plan label, not a duplicate
  }, 30000);

  it("keeps unknown executed steps in chronological order with a human fallback title", async () => {
    const markup = await renderTimeline([
      stepActivity(step(1, "read", "completed"), { sequence: 1 }),
      stepActivity(step(2, "thread.turn", "completed"), { sequence: 2 }),
      stepActivity(step(3, "user.input", "completed"), { sequence: 3 }),
      stepActivity(step(4, "act", "completed"), { sequence: 4 }),
      stepActivity(step(5, "thread.turn", "started", { detail: "Retry the merge" }), {
        sequence: 5,
      }),
    ]);

    expect(markup).not.toContain("Additional steps");
    expect(countOccurrences(markup, 'data-step-runtime="unknown"')).toBe(1);
    expect(markup).toContain("Agent task");
    // Runtime detail remains an expandable work log, never a row title or raw kind badge.
    expect(markup).toContain("Retry the merge");
    expect(markup).not.toContain(">THREAD.TURN<");
  }, 30000);

  it("hides thread creation and inserts unknown work before later plan rows", async () => {
    const markup = await renderTimeline([
      stepActivity(step(1, "thread.create", "completed", { detail: "internal setup" }), {
        sequence: 1,
      }),
      stepActivity(step(2, "thread.turn", "completed"), { sequence: 2 }),
      stepActivity(step(3, "custom.operation", "completed", { detail: "raw work detail" }), {
        sequence: 3,
      }),
      stepActivity(step(4, "user.input", "waiting", { detail: "Merge it?" }), { sequence: 4 }),
    ]);

    expect(markup).not.toContain("internal setup");
    expect(markup).toContain("Additional workflow work");
    expect(markup).not.toContain("custom.operation");
    expect(markup.indexOf("Workflow step")).toBeLessThan(markup.indexOf("Merge it?"));
  }, 30000);

  it("renders a re-emitted step (started then completed) once, as completed", async () => {
    const markup = await renderTimeline([
      stepActivity(step(1, "thread.turn", "started"), { sequence: 1 }),
      stepActivity(step(1, "thread.turn", "completed"), { sequence: 2 }),
    ]);

    expect(countOccurrences(markup, 'data-step-status="completed"')).toBe(1);
    expect(countOccurrences(markup, 'data-step-status="started"')).toBe(0);
    expect(countOccurrences(markup, 'data-step-status="pending"')).toBe(3);
  }, 30000);

  it("renders the run-level terminal banner (completed and failed)", async () => {
    const completedMarkup = await renderTimeline([
      stepActivity(step(1, "read", "completed"), { sequence: 1 }),
      runActivity("completed"),
    ]);
    expect(completedMarkup).toContain('data-run-status="completed"');
    expect(completedMarkup).toContain("Run completed");

    const failedMarkup = await renderTimeline([
      stepActivity(step(1, "read", "failed", { error: "boom" }), { sequence: 1 }),
      runActivity("failed", "boom"),
    ]);
    expect(failedMarkup).toContain('data-run-status="failed"');
    expect(failedMarkup).toContain("Run failed");
    expect(failedMarkup).toContain("boom");
  }, 30000);

  it("keeps the static plan card when no step activities exist for the run", async () => {
    const markup = await renderTimeline([]);
    expect(markup).toContain("shape.pr-review");
    expect(markup).not.toContain("The plan");
    expect(markup).not.toContain("data-step-status");
  }, 30000);
  it("renders repair phases as host-authored labels, never runtime details", async () => {
    const markup = await renderTimeline([
      stepActivity(step(1, "workflow.self-heal", "started", { detail: "Analysing failure" }), {
        sequence: 1,
      }),
      stepActivity(step(2, "workflow.self-heal", "started", { detail: "Repairing workflow" }), {
        sequence: 2,
      }),
      stepActivity(step(3, "workflow.self-heal", "started", { detail: "Resuming workflow" }), {
        sequence: 3,
      }),
      stepActivity(
        step(4, "workflow.self-heal", "failed", {
          detail: "Repair attempt failed",
          error: "nexplore/coding should never be a row title",
        }),
        { sequence: 4 },
      ),
    ]);

    const labels = [
      "Analysing failure",
      "Repairing workflow",
      "Resuming workflow",
      "Repair attempt failed",
    ];
    for (const label of labels) expect(markup).toContain(label);
    expect(labels.map((label) => markup.indexOf(label))).toEqual(
      [...labels.map((label) => markup.indexOf(label))].toSorted((a, b) => a - b),
    );
    expect(markup).not.toContain(">workflow.self-heal<");
    expect(markup).not.toContain("nexplore/coding should never be a row title");
    expect(markup).toContain("Final error");
  }, 30000);
});
