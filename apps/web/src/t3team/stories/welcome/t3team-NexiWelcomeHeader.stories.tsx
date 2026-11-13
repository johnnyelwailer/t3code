import type { Meta, StoryObj } from "@storybook/react";

import { NexiWelcomeHeader } from "~/t3team/welcome/t3team-NexiWelcomeHeader";
import { WelcomePageShell } from "./t3team-NexiWelcomeLayout.fixtures";

/** The production header: brand and one plain line, shown at the top of the welcome page. */
const meta = {
  title: "T3Team/Welcome/Header",
  parameters: { layout: "fullscreen" },
  render: () => (
    <WelcomePageShell>
      <NexiWelcomeHeader />
    </WelcomePageShell>
  ),
} satisfies Meta;

export default meta;
export const Default: StoryObj<typeof meta> = {};
