// @vitest-environment jsdom
/**
 * Live workflow-step overlay on the plan (shape) card:
 *   • derivation groups `t3work.recipe.workflow.step` activities per run, orders by the
 *     numeric journal seq in the stepId, keeps the LATEST phase per stepId, and splits the
 *     run-level terminal activity (`run:<runId>`) out of the step list;
 *   • the timeline overlays each plan step with its live status (spinner / check / clock /
 *     error), appends executed steps the plan has no row for, and keeps unexecuted plan
 *     steps neutral;
 *   • a re-emission of the same stepId (started → completed) renders ONCE, as completed;
 *   • the run-level terminal activity renders the completed/failed banner.
 */

import { EventId, MessageId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
  type ProjectRecipeWorkflowStepActivityPayload,
} from "@t3tools/project-recipes";
import { type ReactNode, type Ref } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { LegendListRef } from "@legendapp/list/react";

import { buildT3workMessagesTimelineTestProps } from "~/t3work/chat/t3work-messagesTimelineTestProps";
import { deriveT3workWorkflowStepRuns } from "~/t3work/chat/t3work-threadWorkflowStepProgress";

import type { ChatMessage } from "~/types";

vi.mock("@legendapp/list/react", async () => {
  const LegendList = (props: {
    data: Array<{ id: string }>;
    keyExtractor: (item: { id: string }) => string;
    renderItem: (args: { item: { id: string } }) => ReactNode;
    ListHeaderComponent?: ReactNode;
    ListFooterComponent?: ReactNode;
    ref?: Ref<LegendListRef>;
  }) => (
    <div>
      {props.ListHeaderComponent}
      {props.data.map((item) => (
        <div key={props.keyExtractor(item)}>{props.renderItem({ item })}</div>
      ))}
      {props.ListFooterComponent}
    </div>
  );

  return { LegendList };
});

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const RUN_ID = "run-1";

function stepActivity(
  payload: ProjectRecipeWorkflowStepActivityPayload,
  overrides?: { createdAt?: string; sequence?: number },
): OrchestrationThreadActivity {
  return {
    id: EventId.make(`t3work-wf-step:${payload.stepId}`),
    tone: payload.phase === "failed" ? "error" : "info",
    kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
    summary: `Workflow step ${payload.phase}: ${payload.detail ?? payload.stepKind}`,
    payload,
    turnId: null,
    createdAt: overrides?.createdAt ?? "2026-07-17T10:00:00.000Z",
    ...(overrides?.sequence === undefined ? {} : { sequence: overrides.sequence }),
  };
}

function step(
  seq: number,
  stepKind: string,
  phase: ProjectRecipeWorkflowStepActivityPayload["phase"],
  extra?: { detail?: string; error?: string },
): ProjectRecipeWorkflowStepActivityPayload {
  return {
    workflowRunId: RUN_ID,
    stepId: `${RUN_ID}:${seq}`,
    stepKind,
    phase,
    ...(extra?.detail === undefined ? {} : { detail: extra.detail }),
    ...(extra?.error === undefined ? {} : { error: extra.error }),
  };
}

function runActivity(phase: "completed" | "failed", error?: string): OrchestrationThreadActivity {
  return stepActivity(
    {
      workflowRunId: RUN_ID,
      stepId: `run:${RUN_ID}`,
      stepKind: "run",
      phase,
      ...(error === undefined ? {} : { error }),
    },
    { createdAt: "2026-07-17T10:05:00.000Z" },
  );
}

function shapeMessage(): ChatMessage {
  return {
    id: MessageId.make("message-shape-live-1"),
    role: "system",
    text: "Plan: shape.pr-review",
    streaming: false,
    createdAt: "2026-07-17T09:59:00.000Z",
    updatedAt: "2026-07-17T09:59:00.000Z",
    turnId: null,
    t3workExt: {
      visibleToUser: true,
      attachments: [
        {
          kind: "view",
          miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
          props: {
            name: "shape.pr-review",
            phases: [{ title: "Review" }, { title: "Decide" }],
            steps: [
              { phase: "Review", kind: "read", label: "github.pullRequest.get" },
              { phase: "Review", kind: "agent", label: "Summarize the risk" },
              { phase: "Decide", kind: "ask", label: "Merge it?" },
              { phase: "Decide", kind: "act", label: "github.pullRequest.merge" },
            ],
            workflowRunId: RUN_ID,
          },
        },
      ],
    },
  };
}

async function renderTimeline(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): Promise<string> {
  const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
  const message = shapeMessage();
  return renderToStaticMarkup(
    <MessagesTimeline
      {...buildT3workMessagesTimelineTestProps()}
      threadActivities={activities}
      timelineEntries={[
        { id: "timeline-0", kind: "message" as const, createdAt: message.createdAt, message },
      ]}
    />,
  );
}

function countOccurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

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

    // plan chrome still owns the card
    expect(markup).toContain("The plan");
    expect(markup).toContain("shape.pr-review");
    // step 1 completed, step 2 running, steps 3+4 not executed yet
    expect(countOccurrences(markup, 'data-step-status="completed"')).toBe(1);
    expect(countOccurrences(markup, 'data-step-status="started"')).toBe(1);
    expect(countOccurrences(markup, 'data-step-status="pending"')).toBe(2);
    // run not terminal yet — no banner
    expect(markup).not.toContain("data-run-status");
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

  it("appends executed steps that do not fit the static plan as extra rows", async () => {
    const markup = await renderTimeline([
      stepActivity(step(1, "read", "completed"), { sequence: 1 }),
      stepActivity(step(2, "thread.turn", "completed"), { sequence: 2 }),
      stepActivity(step(3, "user.input", "completed"), { sequence: 3 }),
      stepActivity(step(4, "act", "completed"), { sequence: 4 }),
      stepActivity(step(5, "thread.turn", "started", { detail: "Retry the merge" }), {
        sequence: 5,
      }),
    ]);

    expect(markup).toContain("Additional steps");
    expect(countOccurrences(markup, 'data-step-extra="true"')).toBe(1);
    expect(markup).toContain("Retry the merge");
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
    expect(markup).toContain("The plan");
    expect(markup).not.toContain("data-step-status");
  }, 30000);
});
