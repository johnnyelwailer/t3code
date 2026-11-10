import type { Meta, StoryObj } from "@storybook/react";

import { JiraBlock, SectionFrame } from "./t3team-NexiWelcomeScenario.fixtures";

/**
 * Jira / Atlassian section — reuses CreateProjectConnectView (token fallback) and
 * JiraConnectionSettings states from T3Team/Settings/Jira Connection + Create Project/Choose.
 */
const meta = {
  title: "T3Team/Welcome/Jira",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const NotConnected: Story = {
  render: () => (
    <SectionFrame title="Jira">
      <JiraBlock state="notConnected" />
    </SectionFrame>
  ),
};

export const TokenFallback: Story = {
  render: () => (
    <SectionFrame title="Jira">
      <JiraBlock state="tokenFallback" />
    </SectionFrame>
  ),
};

export const Connected: Story = {
  render: () => (
    <SectionFrame title="Jira">
      <JiraBlock state="connected" />
    </SectionFrame>
  ),
};

export const Skipped: Story = {
  render: () => (
    <SectionFrame title="Jira">
      <JiraBlock state="skipped" />
    </SectionFrame>
  ),
};
