import type { Meta, StoryObj } from "@storybook/react";

import { GitHubSignInView } from "~/t3team/components/t3team-GitHubSignInAction";

const noop = () => {};

const meta: Meta<typeof GitHubSignInView> = {
  title: "T3Team/GitHub/Sign In",
  component: GitHubSignInView,
  parameters: { layout: "padded" },
  args: { host: "nexplore.ghe.com", state: undefined, onStart: noop, onCancel: noop },
  decorators: [
    (Story) => (
      <div className="w-[420px] rounded-xl border bg-card p-4 text-card-foreground">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Not signed in: the sign-in button, with the terminal route one click away. */
export const SignedOut: Story = {};

export const GitHubDotCom: Story = { args: { host: "github.com" } };

export const Starting: Story = {
  args: { state: { tool: "gh", phase: "starting", hostname: "nexplore.ghe.com" } },
};

/** gh printed its one-time code and polls on its own; one click copies it and opens the page. */
export const AwaitingApproval: Story = {
  args: {
    state: {
      tool: "gh",
      phase: "awaiting-open",
      hostname: "nexplore.ghe.com",
      url: "https://nexplore.ghe.com/login/device",
      displayCode: "0749-5FAA",
    },
  },
};

/** The code timed out (gh's own words), so the terminal route is shown alongside a retry. */
export const Failed: Story = {
  args: {
    state: {
      tool: "gh",
      phase: "failed",
      hostname: "nexplore.ghe.com",
      message: "✗ Timeout trying to log in to nexplore.ghe.com using token",
    },
  },
};

export const SignedIn: Story = {
  args: {
    state: { tool: "gh", phase: "connected", hostname: "nexplore.ghe.com", account: "pj" },
  },
};
