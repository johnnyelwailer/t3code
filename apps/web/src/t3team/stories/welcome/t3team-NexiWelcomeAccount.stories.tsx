import type { Meta, StoryObj } from "@storybook/react";

import { AccountBlock, SectionFrame } from "./t3team-NexiWelcomeScenario.fixtures";

/**
 * Entra sign-in row inside Cloud — unlocks cloud sessions, phone, and cross-device threads.
 */
const meta = {
  title: "T3Team/Welcome/Cloud Entra",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const SignedOut: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <AccountBlock state="signedOut" />
    </SectionFrame>
  ),
};

export const WaitingForCode: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <AccountBlock state="waitingForCode" />
    </SectionFrame>
  ),
};

export const SignedIn: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <AccountBlock state="signedIn" />
    </SectionFrame>
  ),
};

export const ServerUnreachable: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <AccountBlock state="serverUnreachable" />
    </SectionFrame>
  ),
};

export const Skipped: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <AccountBlock state="skipped" />
    </SectionFrame>
  ),
};
