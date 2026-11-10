import type { Meta, StoryObj } from "@storybook/react";

import { CloudBlock, SectionFrame } from "./t3team-NexiWelcomeScenario.fixtures";

/**
 * Cloud section — Entra sign-in first (enables cloud), then cloud sessions + phone.
 */
const meta = {
  title: "T3Team/Welcome/Cloud",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const SignedOutLocked: Story = {
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

export const SignedInOptIn: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <CloudBlock account="signedIn" cloudPhone="optIn" />
    </SectionFrame>
  ),
};

export const SignedInOn: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <CloudBlock account="signedIn" cloudPhone="on" />
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
      <CloudBlock account="signedIn" cloudPhone="skipped" />
    </SectionFrame>
  ),
};
