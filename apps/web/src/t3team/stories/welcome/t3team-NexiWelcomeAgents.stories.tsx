import type { Meta, StoryObj } from "@storybook/react";

import { AgentsBlock, SectionFrame } from "./t3team-NexiWelcomeScenario.fixtures";

/**
 * Agents section — reuses OnboardingReadyAgents and ModelPickerProviderConnectPanel
 * (see T3Team/Providers/Model Picker Connect) inside the welcome band.
 */
const meta = {
  title: "T3Team/Welcome/Agents",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const NexploreReady: Story = {
  render: () => (
    <SectionFrame title="Agents">
      <AgentsBlock state="ready" />
    </SectionFrame>
  ),
};

/** Available with no action — Nexplore AI needs no sign-in or setup. */
export const Available: Story = {
  render: () => (
    <SectionFrame title="Agents">
      <AgentsBlock state="none" />
    </SectionFrame>
  ),
};

export const NexploreUnreachable: Story = {
  render: () => (
    <SectionFrame title="Agents">
      <AgentsBlock state="unreachable" />
    </SectionFrame>
  ),
};
