import type { Meta, StoryObj } from "@storybook/react";

import { AccountBlock, CloudPhoneBlock, SectionFrame } from "./t3team-NexiWelcomeScenario.fixtures";

/**
 * Cloud section: Entra sign-in first, then Cloud sessions + Phone (locked until signed in).
 */
const meta = {
  title: "T3Team/Welcome/Cloud",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const LockedNeedsSignIn: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <AccountBlock state="signedOut" />
      <CloudPhoneBlock state="locked" entraSignedIn={false} />
    </SectionFrame>
  ),
};

export const OptIn: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <AccountBlock state="signedIn" />
      <CloudPhoneBlock state="optIn" entraSignedIn />
    </SectionFrame>
  ),
};

export const On: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <AccountBlock state="signedIn" />
      <CloudPhoneBlock state="on" entraSignedIn />
    </SectionFrame>
  ),
};

export const Skipped: Story = {
  render: () => (
    <SectionFrame title="Cloud">
      <AccountBlock state="signedIn" />
      <CloudPhoneBlock state="skipped" entraSignedIn />
    </SectionFrame>
  ),
};
