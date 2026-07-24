import type { Meta, StoryObj } from "@storybook/react";
import { App } from "~/t3team/t3team-App";
import { withT3TeamRouter } from "~/t3team/storybook/t3team-storybook-router-decorator";

const meta = {
  title: "Archived/App",
  component: App,
  decorators: [withT3TeamRouter],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
