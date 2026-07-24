// @vitest-environment jsdom
import { EventId } from "@t3tools/contracts";
import { PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP } from "@t3tools/project-recipes";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { deriveT3TeamWorkflowStepRuns } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import {
  formatWorkflowStepDue,
  T3TeamWorkflowShapeLiveCard,
  workflowControlErrorMessage,
} from "~/t3team/chat/t3team-messageShapeCardLive";
import {
  countOccurrences,
  renderTimeline,
  RUN_ID,
  runActivity,
  step,
  stepActivity,
  TEST_WORKFLOW_SHAPE,
} from "~/t3team/chat/t3team-messageShapeCardLive.testSupport";

describe("deriveT3TeamWorkflowStepRuns", () => {
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

    const runs = deriveT3TeamWorkflowStepRuns(activities);
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
    const runs = deriveT3TeamWorkflowStepRuns([
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

describe("workflow controls", () => {
  it("maps a missing development route to a visible restart instruction", () => {
    expect(workflowControlErrorMessage(new Error("Request failed: 404 Not Found"))).toContain(
      "Server restart required",
    );
  });

  it("shows queued capacity feedback on the workflow card", async () => {
    const markup = await renderTimeline([runActivity("started")], undefined, { status: "queued" });
    expect(markup).toContain("Queued · starts when capacity is free");
  });
});

describe("live workflow step overlay on the plan card", () => {
  it("formats compact locale-aware timer metadata", () => {
    const now = new Date("2026-04-01T12:00:00.000Z");
    const options = { now, locale: "en-US", timeZone: "UTC" };
    expect(formatWorkflowStepDue("2026-04-01T12:00:05.000Z", options)).toBe("in 5 sec");
    expect(formatWorkflowStepDue("2026-04-01T12:03:00.000Z", options)).toBe("in 3 min");
    expect(formatWorkflowStepDue("2026-04-01T21:00:00.000Z", options)).toBe("9:00 PM");
    expect(formatWorkflowStepDue("2026-04-02T09:00:00.000Z", options)).toBe("tomorrow");
    expect(formatWorkflowStepDue("2026-04-06T09:00:00.000Z", options)).toBe("Mon, Apr 6");
  });

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
    // step 1 completed, step 2 is actively running, steps 3+4 not executed yet
    expect(countOccurrences(markup, 'data-step-status="completed"')).toBe(1);
    expect(countOccurrences(markup, 'data-step-status="waiting"')).toBe(0);
    expect(countOccurrences(markup, 'data-step-status="started"')).toBe(1);
    expect(countOccurrences(markup, 'data-step-status="pending"')).toBe(2);
    expect(countOccurrences(markup, "animate-spin")).toBe(1);
    expect(markup).not.toContain("lucide-clock");
    // Rows with no human detail stay plain. They must not become expandable just to show
    // `thread.turn` or another journal implementation name.
    expect(countOccurrences(markup, 'data-step-row-shell="interactive"')).toBe(0);
    expect(countOccurrences(markup, 'data-step-row-shell="static"')).toBe(4);
    expect(countOccurrences(markup, "data-step-row-navigation-slot")).toBe(4);
    expect(markup).not.toContain("lucide-chevron-right");
    expect(countOccurrences(markup, "rounded-md px-1 py-0.5")).toBe(4);
    // run not terminal yet — no banner
    expect(markup).not.toContain("data-run-status");
    expect(markup).toContain("Waiting for agent");
  }, 30000);

  it("makes a child step row the thread navigation target and hides journal implementation names", async () => {
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

    expect(markup).not.toContain("Work log");
    expect(markup).not.toContain("thread.turn");
    expect(markup).toContain('data-step-row-shell="thread-link"');
    expect(markup).toContain('aria-label="Open step thread"');
    expect(markup).toContain("lucide-chevron-right");
    // Every row owns the same fixed-width end slot; only the child-thread row fills it.
    expect(countOccurrences(markup, "data-step-row-navigation-slot")).toBe(
      countOccurrences(markup, 'data-step-row-shell="static"') +
        countOccurrences(markup, 'data-step-row-shell="thread-link"'),
    );
    expect(countOccurrences(markup, "lucide-chevron-right")).toBe(1);
    expect(markup).not.toContain("Open thread");
  }, 30000);

  it("keeps the authored label and renders generated child status in that step row", () => {
    const activities = [
      stepActivity(
        step(1, "thread.turn", "started", {
          detail: "Summarize the risk",
          projectId: "project-1",
          threadId: "child-1",
        }),
      ),
    ];
    const progress = deriveT3TeamWorkflowStepRuns(activities).get(RUN_ID)!;
    const markup = renderToStaticMarkup(
      <T3TeamWorkflowShapeLiveCard
        shape={TEST_WORKFLOW_SHAPE}
        progress={progress}
        childStatuses={{ "child-1": "Checking retry behavior" }}
      />,
    );

    expect(markup).toContain("Summarize the risk");
    expect(markup).toContain('data-step-child-status="Checking retry behavior"');
    expect(markup).toContain("Checking retry behavior");
    expect(markup).not.toContain("data-workflow-child-status");
  });

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
    expect(markup).toContain("lucide-circle-dashed");
    expect(markup).not.toContain("lucide-clock");
    // the waiting row shows only status — the ask question is the decision card's job
    expect(countOccurrences(markup, "Merge it?")).toBe(1); // the plan label, not a duplicate
    expect(markup).toContain("Waiting for your answer");
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
    expect(markup).toContain("Retry the merge");
    // Runtime detail remains an expandable work log, never a row title or raw kind badge.
    expect(markup).toContain("Retry the merge");
    expect(markup).not.toContain(">THREAD.TURN<");
  }, 30000);

  it("uses the clock only for unresolved scheduled work", async () => {
    const markup = await renderTimeline(
      [
        stepActivity(
          step(1, "wait.until", "started", { detail: "Sleep until 2026-07-20T09:00:00.000Z" }),
        ),
      ],
      undefined,
      { status: "sleeping" },
    );

    expect(countOccurrences(markup, 'data-step-status="scheduled"')).toBe(1);
    expect(countOccurrences(markup, 'data-step-status="started"')).toBe(0);
    expect(countOccurrences(markup, "data-step-due")).toBe(1);
    expect(markup).toContain("lucide-clock");
  }, 30000);

  it("spins only the individual row that is actively working", async () => {
    const activeMarkup = await renderTimeline([
      stepActivity(step(1, "read", "started", { detail: "github.pullRequest.get" })),
    ]);
    expect(countOccurrences(activeMarkup, "animate-spin")).toBe(1);
    expect(activeMarkup).toContain('data-run-live-status="Running');

    const waitingMarkup = await renderTimeline([
      stepActivity(step(1, "thread.turn", "started", { detail: "Summarize the risk" })),
    ]);
    expect(countOccurrences(waitingMarkup, "animate-spin")).toBe(1);
    expect(waitingMarkup).not.toContain("lucide-clock");
  }, 30000);

  it("animates preparation but keeps starting and terminal setup states static", async () => {
    const preparingMarkup = await renderTimeline([
      stepActivity(step(1, "workflow.self-heal", "started", { detail: "Repairing workflow" })),
    ]);
    expect(preparingMarkup).toContain("Getting workflow ready");
    expect(preparingMarkup).not.toContain(">Repairing workflow<");
    expect(countOccurrences(preparingMarkup, "animate-spin")).toBe(1);

    const startingMarkup = await renderTimeline([
      stepActivity(step(1, "workflow.self-heal", "started", { detail: "Resuming workflow" })),
    ]);
    expect(startingMarkup).toContain("Starting workflow");
    expect(countOccurrences(startingMarkup, "animate-spin")).toBe(0);
  }, 30000);

  it("clears stale workflow preparation when a stopped run still has a repair activity", async () => {
    const stoppedMarkup = await renderTimeline(
      [stepActivity(step(1, "workflow.self-heal", "started", { detail: "Repairing workflow" }))],
      undefined,
      { status: "cancelled" },
    );

    expect(stoppedMarkup).toContain('data-run-live-status="Stopped"');
    expect(stoppedMarkup).not.toContain("Getting workflow ready");
    expect(stoppedMarkup).not.toContain("data-workflow-repair-status");
    expect(stoppedMarkup).not.toContain('data-run-live-status="Running');
    expect(stoppedMarkup).not.toContain("animate-spin");
  }, 30000);

  it("shows the repair reason and opens its hidden child thread from the repair strip", async () => {
    const markup = await renderTimeline(
      [
        stepActivity(
          step(1, "workflow.self-heal", "started", {
            detail: "Analysing failure",
            error: "Release validation timed out",
          }),
          { sequence: 1 },
        ),
        stepActivity(
          step(2, "workflow.self-heal", "started", {
            detail: "Repairing workflow",
            projectId: "project-1",
            threadId: "run-1:repair:1",
          }),
          { sequence: 2 },
        ),
      ],
      () => {},
    );

    expect(markup).toContain('data-workflow-repair-status="Getting workflow ready"');
    expect(markup).toContain("Release validation timed out");
    expect(markup).toContain('aria-label="Open workflow repair thread"');
    expect(markup).toContain("lucide-chevron-right");
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

  it("shows pause only at parked boundaries, resume while paused, and stop while live", async () => {
    const waiting = [stepActivity(step(1, "thread.turn", "started"))];
    const suspendedMarkup = await renderTimeline(waiting, undefined, { status: "suspended" });
    expect(suspendedMarkup).toContain('aria-label="Pause workflow"');
    expect(suspendedMarkup).toContain('aria-label="More workflow actions"');
    expect(suspendedMarkup).not.toContain('aria-label="Stop workflow"');
    expect(suspendedMarkup).not.toContain('aria-label="Resume workflow"');

    const runningMarkup = await renderTimeline(waiting, undefined, { status: "running" });
    expect(runningMarkup).not.toContain('aria-label="Pause workflow"');
    expect(runningMarkup).toContain('aria-label="More workflow actions"');
    expect(runningMarkup).not.toContain('aria-label="Stop workflow"');

    const pausedMarkup = await renderTimeline([...waiting, runActivity("paused")], undefined, {
      status: "paused",
    });
    expect(pausedMarkup).toContain('aria-label="Resume workflow"');
    expect(pausedMarkup).toContain('aria-label="More workflow actions"');
    expect(pausedMarkup).toContain("Run paused");

    const stoppedMarkup = await renderTimeline([...waiting, runActivity("cancelled")], undefined, {
      status: "cancelled",
    });
    expect(stoppedMarkup).toContain("Run stopped");
    expect(stoppedMarkup).toContain('data-step-status="cancelled"');
    expect(stoppedMarkup).not.toContain('data-step-status="started"');
    expect(stoppedMarkup).not.toContain("animate-spin");
    expect(stoppedMarkup).not.toContain('aria-label="Stop workflow"');
    expect(stoppedMarkup).not.toContain('aria-label="More workflow actions"');
  }, 30000);

  it("keeps the static plan card when no step activities exist for the run", async () => {
    const markup = await renderTimeline([]);
    expect(markup).toContain("shape.pr-review");
    expect(markup).not.toContain("The plan");
    expect(markup).not.toContain("data-step-status");
  }, 30000);
  it("renders repair as one compact card state and not a duplicate generic work log", async () => {
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

    expect(markup).toContain('data-workflow-repair-status="Needs attention"');
    expect(markup).toContain("Needs attention");
    expect(markup).not.toContain("Analysing failure");
    expect(markup).not.toContain("Repair attempt failed");
    expect(markup).not.toContain("Work Log");
    expect(markup).not.toContain(">workflow.self-heal<");
    expect(markup).not.toContain("nexplore/coding should never be a row title");
  }, 30000);
});
