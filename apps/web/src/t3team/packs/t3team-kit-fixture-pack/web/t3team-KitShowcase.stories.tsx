import type { Meta, StoryObj } from "@storybook/react";

import { KitShowcase } from "./t3team-KitShowcase";

/** A pack story: every pack-ui primitive as a pack renders it, in both themes. */
const meta = {
  title: "Packs/pack-ui kit",
  component: KitShowcase,
  parameters: { layout: "padded" },
  args: { title: "pack-ui:1" },
} satisfies Meta<typeof KitShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = { globals: { theme: "light" } };

export const Dark: Story = { globals: { theme: "dark" } };
