import type { Meta, StoryObj } from "@storybook/react";
import { MessageId, type OrchestrationWorkflowRunStatus } from "@t3tools/contracts";

import { ThreadOrchestrationPanelView } from "~/t3team/components/t3team-ThreadOrchestrationPanel";

/**
 * The Orchestration section of the thread details panel, rendered by the production view with run
 * facts shaped like the server's `workflowRunStatus`. The dock item supplies the name and step
 * summaries a live run carries; without one the row reports status alone.
 */
const NOW = "2026-10-13T10:00:00.000Z";

const LAUNCH_MESSAGE_ID = MessageId.make("t3team-wf-shape:run-1");

const sleepingRun: OrchestrationWorkflowRunStatus = {
  runId: "run-1",
  status: "sleeping",
  pendingKind: null,
  wakeAt: NOW,
  updatedAt: NOW,
  messageId: LAUNCH_MESSAGE_ID,
};

const meta: Meta<typeof ThreadOrchestrationPanelView> = {
  title: "T3Team/Thread details/Orchestration",
  component: ThreadOrchestrationPanelView,
  decorators: [
    (Story) => (
      <div className="w-72 rounded-lg border border-border bg-background">
        <Story />
      </div>
    ),
  ],
  args: {
    run: sleepingRun,
    dockItems: [],
    onLocate: () => {},
    onControl: async () => ({}),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const UnnamedRun: Story = {};

export const NamedRunWithSteps: Story = {
  args: {
    dockItems: [
      {
        runId: "run-1",
        messageId: LAUNCH_MESSAGE_ID,
        name: "Weekly release train",
        summaries: ["Waiting: Merge the release PR?", "Next: tag and publish"],
      },
    ],
  },
};

export const Suspended: Story = {
  args: { run: { ...sleepingRun, status: "suspended", pendingKind: "user.input", wakeAt: null } },
};
