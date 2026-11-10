import type { Meta, StoryObj } from "@storybook/react";

import {
  NexiWelcomePageMockup,
  SCENARIOS,
  type WelcomeScenario,
} from "./t3team-NexiWelcomeScenario.fixtures";

/**
 * Storybook-only mockups of the Nexi Work single-page welcome / first-run experience.
 * Not wired to routes, flags, or the live WelcomeWizard.
 */
const meta = {
  title: "T3Team/Welcome/Page",
  parameters: { layout: "fullscreen" },
  render: (args: { scenario: WelcomeScenario }) => (
    <NexiWelcomePageMockup scenario={args.scenario} />
  ),
} satisfies Meta<{ scenario: WelcomeScenario }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FreshInstall: Story = { args: { scenario: SCENARIOS.FreshInstall } };

/** Entra WaitingForCode (in Cloud), Jira connected, GHE AwaitingApproval. */
export const InProgress: Story = { args: { scenario: SCENARIOS.InProgress } };

export const AllDone: Story = { args: { scenario: SCENARIOS.AllDone } };

export const SkippedOptional: Story = { args: { scenario: SCENARIOS.SkippedOptional } };

/** Role section only when the feature toggle is on (off by default in product). */
export const RoleToggleOn: Story = { args: { scenario: SCENARIOS.RoleToggleOn } };

/** Nexplore AI not reachable on this network — quiet status, no setup action. */
export const NexploreAIUnreachable: Story = {
  args: { scenario: SCENARIOS.NexploreAIUnreachable },
};

export const ServerUnreachable: Story = { args: { scenario: SCENARIOS.ServerUnreachable } };

export const Narrow390: Story = {
  args: { scenario: SCENARIOS.Narrow390 },
  parameters: {
    viewport: { value: "phone", isRotated: false },
  },
};
