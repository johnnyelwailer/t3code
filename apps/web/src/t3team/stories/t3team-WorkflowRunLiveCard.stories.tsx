/**
 * Live workflow-run plan card (recipe UX "no black box" slice) — the plan (shape) card
 * overlaid with live step status derived from `t3team.recipe.workflow.step` activities.
 *
 * The card is COLLAPSED TO ONE COMPACT ROW BY DEFAULT: chevron + run title + status chip +
 * the current step (ellipsed when it no longer fits) — no banner, no description line, no
 * nested disclosure. Clicking the row animates the card body open; the chevron rotates with
 * state. It auto-expands — and cannot be collapsed back — while the run has FAILED or is
 * WAITING ON THE USER, so a problem card never hides its reason (pinned-open rows carry no
 * chevron and no toggle).
 *
 * The mid-flight story shows the live states at once: completed steps, one waiting on the
 * user (`user.input`), one sleeping (`wait.until`) — and it demonstrates REACHABILITY: the
 * unreached Ship step ("Publish release") has no live event, so it is not rendered at all
 * (no dimmed placeholder, no "N more to go", and no Ship phase header). It auto-expands on the
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
  // Tool/script steps carry the DERIVED human title (the humanized last segment of the callee);
  // the full technical callee stays in `detail` (tooltip / step details), never the row title.
  steps: [
    {
      phase: "Prepare",
      kind: "read",
      label: "Collect changelog",
      detail: "github.releases.collectChangelog",
    },
    { phase: "Prepare", kind: "agent", label: "Draft the release notes" },
    { phase: "Gate", kind: "ask", label: "Sign off the release notes?" },
    { phase: "Gate", kind: "agent", label: "Wait for the release window" },
    // UNREACHED in the mid-flight story: the run has not reached this step yet, so the card
    // renders it nowhere — no placeholder row, no Ship header, no counter.
    { phase: "Ship", kind: "act", label: "Publish release", detail: "github.release.publish" },
  ],
  workflowRunId: "run-release-42",
} as const;

/** Mid-flight: auto-expands on the waiting `user.input` step — a problem card never hides its
 * state. The unreached Ship step is absent (reachable steps only). Agent rows use the titled
 * robot icon, while ASK remains a visible action tag. */
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
        // Note what is NOT here: the Ship step has no live event, so it does not appear in the
        // card at all — the run has not reached it.
      ],
      run: null,
    },
  },
};

/**
 * Collapsed BY DEFAULT: a healthy in-flight run is a single compact row — chevron, run title,
 * status chip, and the current step (ellipsed if it no longer fits on the line). Clicking the
 * row animates the card body open; the chevron rotates with state.
 */
export const Collapsed: Story = {
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
 * the rows in view — the collapsed default hides them behind one click). The two tool steps carry
 * their callee in `detail` so they light up the plan steps instead of rendering as extras. */
export const WithExtraSteps: Story = {
  args: {
    shape,
    initiallyExpanded: true,
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
        { stepId: "run-release-42:3", seq: 3, stepKind: "user.input", phase: "completed" },
        { stepId: "run-release-42:4", seq: 4, stepKind: "wait.until", phase: "completed" },
        {
          stepId: "run-release-42:5",
          seq: 5,
          stepKind: "tool.call",
          phase: "completed",
          detail: "github.release.publish",
        },
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
          phase: "failed",
          detail: "Draft the release notes",
          error: "model refused the draft",
        },
      ],
      run: { phase: "failed", error: "step 2 failed: model refused the draft" },
    },
  },
};

/**
 * A failed run overrides the collapsed default: the card auto-expands and keeps the failure
 * reason (banner + failed row) visible even though `initiallyExpanded` is false. The pinned-open
 * header row carries no chevron and no toggle — a problem card never hides its reason behind
 * a disabled control.
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
