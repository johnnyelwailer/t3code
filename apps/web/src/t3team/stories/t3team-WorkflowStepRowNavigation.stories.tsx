import type { Meta, StoryObj } from "@storybook/react";

import { T3TeamWorkflowStepDetails } from "~/t3team/chat/t3team-WorkflowStepDetails";
import type { T3TeamWorkflowStepEntry } from "~/t3team/chat/t3team-threadWorkflowStepProgress";

const LAUNCH_THREAD = "thread-launch";

function step(threadId: string): T3TeamWorkflowStepEntry {
  return {
    stepId: "run-1:3",
    seq: 3,
    stepKind: "thread.turn",
    phase: "completed",
    projectId: "project-1",
    threadId,
  };
}

function Frame({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="max-w-md space-y-2 rounded-lg border border-border bg-background p-3 text-sm">
      {children}
    </div>
  );
}

const meta = {
  title: "T3Team/Workflow Step Row Navigation",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * A step that ran on the thread you are looking at. `describe-rewrite`'s writer runs via
 * `thread.askAgent` on the launch thread, so this is its normal case: no chevron, no hover target,
 * nothing that suggests there is another conversation to open.
 */
export const RanOnThisThread: Story = {
  render: () => (
    <Frame>
      <T3TeamWorkflowStepDetails
        step={step(LAUNCH_THREAD)}
        currentThreadId={LAUNCH_THREAD}
        onOpenThread={() => {}}
      >
        <span className="text-foreground/90">Rewrite NXAI-6</span>
      </T3TeamWorkflowStepDetails>
    </Frame>
  ),
};

/** A genuine child thread — still navigable, chevron and all. */
export const ChildThread: Story = {
  render: () => (
    <Frame>
      <T3TeamWorkflowStepDetails
        step={step("thread-child")}
        currentThreadId={LAUNCH_THREAD}
        onOpenThread={() => {}}
      >
        <span className="text-foreground/90">Summarize linked issues</span>
      </T3TeamWorkflowStepDetails>
    </Frame>
  ),
};

/** Side by side — the difference PJ is judging. */
export const BothRows: Story = {
  render: () => (
    <Frame>
      <T3TeamWorkflowStepDetails
        step={step(LAUNCH_THREAD)}
        currentThreadId={LAUNCH_THREAD}
        onOpenThread={() => {}}
      >
        <span className="text-foreground/90">Rewrite NXAI-6 (ran here)</span>
      </T3TeamWorkflowStepDetails>
      <T3TeamWorkflowStepDetails
        step={step("thread-child")}
        currentThreadId={LAUNCH_THREAD}
        onOpenThread={() => {}}
      >
        <span className="text-foreground/90">Summarize linked issues (child)</span>
      </T3TeamWorkflowStepDetails>
    </Frame>
  ),
};
