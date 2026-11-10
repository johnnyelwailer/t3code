import type { Meta, StoryObj } from "@storybook/react";

import { AccountBlock, SectionFrame } from "./t3team-NexiWelcomeScenario.fixtures";

/**
 * Nexplore (Entra) account section — reuses AccountSignInCard states from
 * Account/AccountSignInCard stories inside the welcome band layout.
 */
const meta = {
  title: "T3Team/Welcome/Account",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const SignedOut: Story = {
  render: () => (
    <SectionFrame title="Account" recommended>
      <AccountBlock state="signedOut" />
    </SectionFrame>
  ),
};

export const WaitingForCode: Story = {
  render: () => (
    <SectionFrame title="Account" recommended>
      <AccountBlock state="waitingForCode" />
    </SectionFrame>
  ),
};

export const SignedIn: Story = {
  render: () => (
    <SectionFrame title="Account" recommended>
      <AccountBlock state="signedIn" />
    </SectionFrame>
  ),
};

export const ServerUnreachable: Story = {
  render: () => (
    <SectionFrame title="Account" recommended>
      <AccountBlock state="serverUnreachable" />
    </SectionFrame>
  ),
};

export const Skipped: Story = {
  render: () => (
    <SectionFrame title="Account" recommended>
      <AccountBlock state="skipped" />
    </SectionFrame>
  ),
};
