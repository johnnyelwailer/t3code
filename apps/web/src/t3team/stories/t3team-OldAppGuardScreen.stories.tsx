import type { Meta, StoryObj } from "@storybook/react";

import {
  OldAppGuardScreen,
  type OldAppGuardState,
} from "~/t3team/components/t3team-OldAppGuardScreen";

/**
 * Inline quit-and-retry screen shown when rc.20 would take over a home the daily
 * Nexi app is still using. The shipped first-launch page is the desktop data URL
 * with this same copy and states; this story is that product UI, no harness chrome.
 */
const meta = {
  title: "Nexi/Old app guard",
  component: OldAppGuardScreen,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OldAppGuardScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const story = (state: OldAppGuardState, theme: "light" | "dark"): Story => ({
  args: { state },
  globals: { theme },
  decorators: [
    (Story) => (
      <div
        className={theme === "dark" ? "dark" : ""}
        style={{
          minHeight: "100vh",
          colorScheme: theme,
          background: theme === "dark" ? "#000" : "#fff",
        }}
      >
        <Story />
      </div>
    ),
  ],
});

export const Blocked: Story = story("blocked", "light");
export const BlockedDark: Story = story("blocked", "dark");
export const Retrying: Story = story("retrying", "light");
export const RetryingDark: Story = story("retrying", "dark");
export const StillRunning: Story = story("still-running", "light");
export const StillRunningDark: Story = story("still-running", "dark");
export const Continuing: Story = story("continuing", "light");
export const ContinuingDark: Story = story("continuing", "dark");
