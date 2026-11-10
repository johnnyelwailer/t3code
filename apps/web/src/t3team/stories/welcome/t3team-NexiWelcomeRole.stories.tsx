import type { Meta, StoryObj } from "@storybook/react";

import { RoleBlock, SectionFrame } from "./t3team-NexiWelcomeScenario.fixtures";

/**
 * Role section — reuses T3TeamRichChoice (T3Team/Rich Choice). Only shown when the
 * work-profile feature toggle is on; off by default in product.
 */
const meta = {
  title: "T3Team/Welcome/Role",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const ToggleOn: Story = {
  render: () => (
    <SectionFrame title="Role">
      <RoleBlock />
    </SectionFrame>
  ),
};
