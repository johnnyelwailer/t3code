import type { Meta, StoryObj } from "@storybook/react";

import { GitHubBlock, SectionFrame } from "./t3team-NexiWelcomeScenario.fixtures";

/**
 * GitHub section — GHE + github.com device sign-in via GitHubSignInView
 * (T3Team/GitHub/Sign In).
 */
const meta = {
  title: "T3Team/Welcome/GitHub",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const SignedOut: Story = {
  render: () => (
    <SectionFrame title="GitHub">
      <GitHubBlock state="signedOut" />
    </SectionFrame>
  ),
};

export const GheAwaitingApproval: Story = {
  render: () => (
    <SectionFrame title="GitHub">
      <GitHubBlock state="gheAwaiting" />
    </SectionFrame>
  ),
};

export const BothSignedIn: Story = {
  render: () => (
    <SectionFrame title="GitHub">
      <GitHubBlock state="bothSignedIn" />
    </SectionFrame>
  ),
};

export const Skipped: Story = {
  render: () => (
    <SectionFrame title="GitHub">
      <GitHubBlock state="skipped" />
    </SectionFrame>
  ),
};
