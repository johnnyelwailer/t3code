import type { Meta, StoryObj } from "@storybook/react";

import { ProjectBlock, SectionFrame } from "./t3team-NexiWelcomeScenario.fixtures";

/**
 * First project section — reuses CreateProjectChooseStep and RepositoryPicker
 * (T3Team/Create Project/Choose, T3Team/Repository Picker).
 */
const meta = {
  title: "T3Team/Welcome/Project",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Idle: Story = {
  render: () => (
    <SectionFrame title="Project" optional>
      <ProjectBlock state="idle" />
    </SectionFrame>
  ),
};

export const Choosing: Story = {
  render: () => (
    <SectionFrame title="Project" optional>
      <ProjectBlock state="choosing" />
    </SectionFrame>
  ),
};

export const Chosen: Story = {
  render: () => (
    <SectionFrame title="Project" optional>
      <ProjectBlock state="chosen" />
    </SectionFrame>
  ),
};

export const Skipped: Story = {
  render: () => (
    <SectionFrame title="Project" optional>
      <ProjectBlock state="skipped" />
    </SectionFrame>
  ),
};
