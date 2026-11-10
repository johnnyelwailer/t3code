import type { Meta, StoryObj } from "@storybook/react";

import { CloudBlock, SectionFrame } from "./t3team-NexiWelcomeScenario.fixtures";

/**
 * Entra sign-in states inside the Cloud section (merged with cloud sessions / phone).
 * Prefer T3Team/Welcome/Cloud for the full section; these keep per-auth-state coverage.
 */
const meta = {
  title: "T3Team/Welcome/Cloud/Entra",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const SignedOut: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <CloudBlock account="signedOut" cloudPhone="locked" />
    </SectionFrame>
  ),
};

export const WaitingForCode: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <CloudBlock account="waitingForCode" cloudPhone="locked" />
    </SectionFrame>
  ),
};

export const SignedIn: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <CloudBlock account="signedIn" cloudPhone="optIn" />
    </SectionFrame>
  ),
};

export const ServerUnreachable: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <CloudBlock account="serverUnreachable" cloudPhone="locked" />
    </SectionFrame>
  ),
};

export const Skipped: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <CloudBlock account="skipped" cloudPhone="skipped" />
    </SectionFrame>
  ),
};
