import type { Meta, StoryObj } from "@storybook/react";

import { withT3TeamRouter } from "~/t3team/storybook/t3team-storybook-router-decorator";
import {
  agentArrangementRefreshScenario,
  agentArrangementScenario,
  allProjectsAgentScenario,
  allProjectsHeuristicScenario,
  emptyGraphScenario,
  errorArrangementScenario,
  heuristicArrangementScenario,
  pausedArrangementScenario,
  ProjectMyWorkDigestFixtureView,
  type ProjectMyWorkDigestFixtureScenario,
} from "~/t3team/t3team-projectMyWorkDigestFixtures";

const meta = {
  title: "T3Team/Project Dashboard/My Work Digest",
  component: ProjectMyWorkDigestFixtureView,
  decorators: [withT3TeamRouter],
  parameters: { layout: "fullscreen" },
  argTypes: {
    nowOffsetHours: {
      label: "Time of day (hours into the sprint)",
      type: "number",
      minimum: 0,
      maximum: 48,
    },
    burndownVariant: {
      label: "Sprint burndown variant",
      options: ["off", "chart", "sparkline"],
      control: "select",
    },
    inAppOpen: {
      label: "Route row clicks through onOpenTicket (demo)",
      control: "boolean",
    },
  },
} satisfies Meta<typeof ProjectMyWorkDigestFixtureView>;

export default meta;

type Story = StoryObj<typeof meta>;

function createStory(scenario: ProjectMyWorkDigestFixtureScenario, description: string): Story {
  return {
    args: { scenario, nowOffsetHours: 0 },
    parameters: { docs: { description: { story: description } } },
  };
}

export const ProjectHeuristic: Story = createStory(
  heuristicArrangementScenario,
  "Single project, before the first click. Deterministic buckets.",
);
export const ProjectAgent: Story = createStory(
  agentArrangementScenario,
  "Single project, durable workflow live. Agent chose sections, order, hints.",
);
export const ProjectGraphChanged: Story = createStory(
  agentArrangementRefreshScenario,
  "Items closed and arrived since the last pass.",
);
export const ProjectPaused: Story = createStory(
  pausedArrangementScenario,
  "Paused via the menu. Facts keep refreshing.",
);
export const ProjectWorkflowFailed: Story = createStory(
  errorArrangementScenario,
  "Heuristic fallback stays up.",
);
export const ProjectEmpty: Story = createStory(emptyGraphScenario, "Nothing assigned.");
export const SprintBurndownChart: Story = {
  args: { scenario: heuristicArrangementScenario, nowOffsetHours: 0, burndownVariant: "chart" },
  parameters: {
    docs: {
      description: {
        story:
          "Sprint time axis as variant A: the personal burndown chart — ideal line, remaining anchored at today, day ticks.",
      },
    },
  },
};
export const SprintBurndownSparkline: Story = {
  args: { scenario: heuristicArrangementScenario, nowOffsetHours: 0, burndownVariant: "sparkline" },
  parameters: {
    docs: {
      description: {
        story:
          "Sprint time axis as variant B: the same data as a quiet sparkline strip in place of the thin bar.",
      },
    },
  },
};
export const AllProjectsHeuristic: Story = createStory(
  allProjectsHeuristicScenario,
  "All projects, project chips on rows and group headers, no sprint bar.",
);
export const AllProjectsAgent: Story = createStory(
  allProjectsAgentScenario,
  "All projects, one arrangement across projects.",
);
