/**
 * Live workflow-run plan card (recipe UX "no black box" slice) — the plan (shape) card
 * overlaid with live step status derived from `t3work.recipe.workflow.step` activities.
 * The mid-flight story shows every status at once: completed steps, one waiting on the
 * user (`user.input`), one sleeping (`wait.until`), and one failed.
 */
import type { Meta, StoryObj } from "@storybook/react";

import { T3workWorkflowShapeLiveCard } from "~/t3work/chat/t3work-messageShapeCardLive";

function WorkflowRunLiveCardStory(props: Parameters<typeof T3workWorkflowShapeLiveCard>[0]) {
  return (
    <div style={{ width: 560 }}>
      <T3workWorkflowShapeLiveCard {...props} />
    </div>
  );
}

const meta = {
  title: "T3work/Chat/WorkflowRunLiveCard",
  component: WorkflowRunLiveCardStory,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof WorkflowRunLiveCardStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const shape = {
  name: "shape.release-train",
  description: "Collect the changelog, wait for the release window, then ship after sign-off.",
  phases: [{ title: "Prepare" }, { title: "Gate" }, { title: "Ship" }],
  steps: [
    { phase: "Prepare", kind: "read", label: "github.releases.collectChangelog" },
    { phase: "Prepare", kind: "agent", label: "Draft the release notes" },
    { phase: "Gate", kind: "ask", label: "Sign off the release notes?" },
    { phase: "Gate", kind: "agent", label: "Wait for the release window" },
    { phase: "Ship", kind: "act", label: "github.release.publish" },
  ],
  workflowRunId: "run-release-42",
} as const;

/** Mid-flight: two done, one waiting on the user, one sleeping, one failed. */
export const MidFlight: Story = {
  args: {
    shape,
    progress: {
      runId: "run-release-42",
      steps: [
        {
          stepId: "run-release-42:1",
          seq: 1,
          stepKind: "tool.call",
          phase: "completed",
          detail: "github.releases.collectChangelog",
        },
        {
          stepId: "run-release-42:2",
          seq: 2,
          stepKind: "thread.turn",
          phase: "completed",
          detail: "Draft the release notes",
        },
        {
          stepId: "run-release-42:3",
          seq: 3,
          stepKind: "user.input",
          phase: "waiting",
          detail: "Sign off the release notes?",
        },
        {
          stepId: "run-release-42:4",
          seq: 4,
          stepKind: "wait.until",
          phase: "waiting",
          detail: "sleeping until 2026-07-18T06:00Z",
        },
        {
          stepId: "run-release-42:5",
          seq: 5,
          stepKind: "tool.call",
          phase: "failed",
          error: "release window check failed",
        },
      ],
      run: null,
    },
  },
};

/** Loop iterations executed beyond the static plan land as appended extra rows. */
export const WithExtraSteps: Story = {
  args: {
    shape,
    progress: {
      runId: "run-release-42",
      steps: [
        { stepId: "run-release-42:1", seq: 1, stepKind: "tool.call", phase: "completed" },
        { stepId: "run-release-42:2", seq: 2, stepKind: "thread.turn", phase: "completed" },
        { stepId: "run-release-42:3", seq: 3, stepKind: "user.input", phase: "completed" },
        { stepId: "run-release-42:4", seq: 4, stepKind: "wait.until", phase: "completed" },
        { stepId: "run-release-42:5", seq: 5, stepKind: "tool.call", phase: "completed" },
        {
          stepId: "run-release-42:6",
          seq: 6,
          stepKind: "thread.turn",
          phase: "started",
          detail: "Announce the release in Slack",
        },
      ],
      run: null,
    },
  },
};

/** Terminal run: the run-level activity drives the failed banner. */
export const FailedRun: Story = {
  args: {
    shape,
    progress: {
      runId: "run-release-42",
      steps: [
        { stepId: "run-release-42:1", seq: 1, stepKind: "tool.call", phase: "completed" },
        {
          stepId: "run-release-42:2",
          seq: 2,
          stepKind: "thread.turn",
          phase: "failed",
          error: "model refused the draft",
        },
      ],
      run: { phase: "failed", error: "step 2 failed: model refused the draft" },
    },
  },
};

/** A workflow child step is one keyboard-accessible row link, with a right chevron. */
export const ChildThread: Story = {
  args: {
    shape,
    progress: {
      runId: "run-release-42",
      steps: [
        { stepId: "run-release-42:1", seq: 1, stepKind: "tool.call", phase: "completed" },
        {
          stepId: "run-release-42:2",
          seq: 2,
          stepKind: "thread.turn",
          phase: "started",
          detail: "Draft the release notes",
          projectId: "project-release",
          threadId: "thread-release-notes",
        },
      ],
      run: null,
    },
    onOpenThread: (input) => console.info("Open workflow child thread", input),
  },
};
