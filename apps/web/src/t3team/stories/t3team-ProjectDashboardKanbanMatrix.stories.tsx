import type { Meta, StoryObj } from "@storybook/react";

import {
  acceptedStoryTodoSubtaskScenario,
  nestedEpicStorySubtaskScenario,
  ProjectDashboardKanbanMatrixFixtureView,
  sameLaneNestedSubtasksScenario,
  type ProjectDashboardKanbanMatrixFixtureScenario,
} from "~/t3team/t3team-projectDashboardKanbanMatrixFixtures";

const meta = {
  title: "T3Team/Project Dashboard/Kanban Matrix",
  component: ProjectDashboardKanbanMatrixFixtureView,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ProjectDashboardKanbanMatrixFixtureView>;

export default meta;

type Story = StoryObj<typeof meta>;

function createStory(scenario: ProjectDashboardKanbanMatrixFixtureScenario): Story {
  return {
    args: { scenario },
  };
}

export const NestedEpicStorySubtask: Story = createStory(nestedEpicStorySubtaskScenario);

export const AcceptedStoryTodoSubtask: Story = createStory(acceptedStoryTodoSubtaskScenario);

export const SameLaneNestedSubtasks: Story = createStory(sameLaneNestedSubtasksScenario);
