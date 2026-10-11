/**
 * Live workflow-run plan card (recipe UX "no black box" slice) — the plan (shape) card
 * overlaid with live step status derived from `t3team.recipe.workflow.step` activities.
 *
 * The card is COLLAPSED BY DEFAULT: one-line description + current step + run status, with the
 * full step list one click away. It auto-expands — and cannot be collapsed back — while the run
 * has FAILED or is WAITING ON THE USER, so a problem card never hides its reason.
 *
 * The mid-flight story shows every status at once: completed steps, one waiting on the
 * user (`user.input`), one sleeping (`wait.until`), and one failed — and auto-expands on the
 * user-waiting step.
 */
import type { Meta, StoryObj } from "@storybook/react";

import { T3TeamWorkflowShapeLiveCard } from "~/t3team/chat/t3team-messageShapeCardLive";

function WorkflowRunLiveCardStory(props: Parameters<typeof T3TeamWorkflowShapeLiveCard>[0]) {
  return (
    <div style={{ width: 560 }}>
      <T3TeamWorkflowShapeLiveCard {...props} />
    </div>
  );
}

const meta = {
  title: "T3Team/Chat/Workflow Run Live Card",
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
  // Tool/script steps carry the generic human title; the technical callee stays in `detail`
  // (tooltip / step details), never the row's primary title.
  steps: [
    { phase: "Prepare", kind: "read", label: "Tool", detail: "github.releases.collectChangelog" },
    { phase: "Prepare", kind: "agent", label: "Draft the release notes" },
    { phase: "Gate", kind: "ask", label: "Sign off the release notes?" },
    { phase: "Gate", kind: "agent", label: "Wait for the release window" },
    { phase: "Ship", kind: "act", label: "Tool", detail: "github.release.publish" },
  ],
  workflowRunId: "run-release-42",
} as const;

/** Mid-flight: auto-expands on the waiting `user.input` step — a problem card never hides its
 * state. Agent rows use the titled robot icon, while ASK remains a visible action tag. */
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

/**
 * Collapsed BY DEFAULT: a healthy in-flight run shows only the one-line description, the current
 * step, and the run status — the full step list is one click away (row click or chevron).
 */
export const Collapsed: Story = {
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
        },
      ],
      run: null,
    },
  },
};

/** Expanded variant of the same healthy run — `initiallyExpanded` seeds the local state. */
export const Expanded: Story = {
  args: {
    ...Collapsed.args,
    initiallyExpanded: true,
  },
};

/** Loop iterations executed beyond the static plan land as appended extra rows (expanded to keep
 * the rows in view — the collapsed default hides them behind one click). */
export const WithExtraSteps: Story = {
  args: {
    shape,
    initiallyExpanded: true,
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

/** Terminal run: the run-level activity drives the failed banner — and auto-expands the card, a
 * problem card never hides its reason. */
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

/**
 * A failed run overrides the collapsed default: the card auto-expands and keeps the failure
 * reason (banner + failed row) visible even though `initiallyExpanded` is false.
 */
export const CollapsedByDefaultAutoExpandedOnFailure: Story = {
  args: {
    ...FailedRun.args,
  },
};

/** Every row keeps the same end slot; the child-thread row is a keyboard link with a chevron
 * (expanded — the collapsed default would hide the row this story documents). */
export const ChildThread: Story = {
  args: {
    shape,
    initiallyExpanded: true,
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
