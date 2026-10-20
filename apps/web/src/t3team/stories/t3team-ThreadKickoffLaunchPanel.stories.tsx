import type { Meta, StoryObj } from "@storybook/react";

import { ThreadKickoffLaunchPanel } from "~/t3team/chat/t3team-threadKickoffLaunchPanel";

const meta = {
  title: "T3Team/Chat/Kickoff Launch Panel",
  component: ThreadKickoffLaunchPanel,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ThreadKickoffLaunchPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Preparing: Story = {
  args: {
    threadId: "thread-kickoff-1",
    kickoffMessage:
      "Investigate the login regression from yesterday's deploy: users on Safari get a blank screen after sign-in.",
    workflow: undefined,
    progress: {
      steps: [
        { id: "create", status: "done" },
        { id: "context", status: "busy" },
        { id: "launch", status: "pending" },
      ],
    },
    bootstrapStatus: "running",
    onRetry: () => {},
  },
};

export const Failed: Story = {
  args: {
    threadId: "thread-kickoff-2",
    kickoffMessage: "Create a QA plan for the release.",
    workflow: {
      kind: "recipe",
      recipeId: "qa-test-plan",
      title: "Create QA plan",
      description: "Build a focused QA plan for the next release.",
      source: "bundled",
      surface: "workitem.detail.sidepanel",
      recipePath: "/tmp/project/.t3team/recipes/qa-test-plan",
      promptPath: "/tmp/project/.t3team/recipes/qa-test-plan/prompt.md",
      workflowPath: "/tmp/project/.t3team/recipes/qa-test-plan/workflow.ts",
    },
    progress: {
      steps: [
        { id: "create", status: "done" },
        { id: "context", status: "error", error: "Context refresh timed out." },
        { id: "launch", status: "pending" },
      ],
    },
    bootstrapStatus: "failed",
    onRetry: () => {},
  },
};
