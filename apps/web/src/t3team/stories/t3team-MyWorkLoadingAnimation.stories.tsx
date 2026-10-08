import type { Meta, StoryObj } from "@storybook/react";

import { MyWorkLoadingAnimation } from "~/t3team/t3team-MyWorkLoadingAnimation";

/**
 * My Work's cold-start animation: what the startup gate shows while it decides, and what both
 * digest bodies show for their first load. Shaped like the real digest (header band, "Needs you"
 * side lane, main-lane cards with ticket rows) so content swaps in without a layout shift.
 *
 * Toggle the toolbar's reduced-motion setting, or the OS one, to see the static form: no shimmer,
 * no breathing glow, same layout.
 */
const meta = {
  title: "T3Team/Project Dashboard/My Work Loading",
  component: MyWorkLoadingAnimation,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story: () => React.ReactElement) => (
      <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    message: { label: "Copy under the mark", control: "text" },
  },
} satisfies Meta<typeof MyWorkLoadingAnimation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FirstLoad: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story:
          "The default: the gate's two-second window and My Work's first digest load use exactly this.",
      },
    },
  },
};

export const Narrow: Story = {
  args: {},
  decorators: [
    (Story: () => React.ReactElement) => (
      <div className="w-full max-w-xl p-4">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Container queries collapse the digest to one lane below 72rem; the skeleton follows, " +
          "because it uses `digestLaneLayout` rather than its own grid.",
      },
    },
  },
};

export const CustomMessage: Story = {
  args: { message: "Catching up with Jira…" },
};
