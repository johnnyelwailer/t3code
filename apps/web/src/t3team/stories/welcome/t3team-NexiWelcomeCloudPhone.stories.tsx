import type { Meta, StoryObj } from "@storybook/react";

import { CloudPhoneBlock, SectionFrame } from "./t3team-NexiWelcomeScenario.fixtures";

/**
 * Cloud sessions + phone — locked without Entra, opt-in when signed in, on with
 * CloudSessionSetupCard (Cloud/CloudSessionSetupCard).
 */
const meta = {
  title: "T3Team/Welcome/Cloud & Phone",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const LockedNeedsSignIn: Story = {
  render: () => (
    <SectionFrame title="Cloud & phone" optional>
      <CloudPhoneBlock state="locked" entraSignedIn={false} />
    </SectionFrame>
  ),
};

export const OptIn: Story = {
  render: () => (
    <SectionFrame title="Cloud & phone" optional>
      <CloudPhoneBlock state="optIn" entraSignedIn />
    </SectionFrame>
  ),
};

export const On: Story = {
  render: () => (
    <SectionFrame title="Cloud & phone" optional>
      <CloudPhoneBlock state="on" entraSignedIn />
    </SectionFrame>
  ),
};

export const Skipped: Story = {
  render: () => (
    <SectionFrame title="Cloud & phone" optional>
      <CloudPhoneBlock state="skipped" entraSignedIn />
    </SectionFrame>
  ),
};
