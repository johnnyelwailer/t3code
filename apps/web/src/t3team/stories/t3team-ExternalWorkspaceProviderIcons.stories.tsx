import type { Meta, StoryObj } from "@storybook/react";

import {
  ExternalWorkspaceProviderIcons,
  type ExternalWorkspaceProvider,
} from "~/components/ExternalWorkspaceProviderIcons";

const meta: Meta<typeof ExternalWorkspaceProviderIcons> = {
  title: "External sessions/Provider icons",
  component: ExternalWorkspaceProviderIcons,
  decorators: [
    (Story) => (
      <div className="flex min-h-32 items-center justify-center bg-background p-8 text-foreground">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const BothProviders: Story = {
  args: { providers: ["Codex", "Claude"] satisfies ReadonlyArray<ExternalWorkspaceProvider> },
};

export const CodexOnly: Story = {
  args: { providers: ["Codex"] satisfies ReadonlyArray<ExternalWorkspaceProvider> },
};
