import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentProps } from "react";

import { TempoTokenSettings } from "~/components/settings/t3team-TempoTokenSettings";
import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import { createMockBackend } from "~/t3team/backend/t3team-mockBackend";

function SettingsStory({
  status,
  tokenResult,
}: {
  readonly status?: boolean;
  readonly tokenResult?: { configured: boolean };
}) {
  const mock = createMockBackend();
  const backend = {
    ...mock,
    atlassian: {
      ...mock.atlassian,
      ...(status !== undefined ? { getTempoStatus: async () => ({ configured: status }) } : {}),
      ...(tokenResult !== undefined ? { setTempoToken: async () => tokenResult } : {}),
    },
  };
  return (
    <BackendProvider backend={backend}>
      <div className="mx-auto w-[560px] max-w-full">
        <TempoTokenSettings />
      </div>
    </BackendProvider>
  );
}

const meta = {
  title: "T3Team/Settings/Tempo Token",
  component: SettingsStory,
  parameters: { layout: "padded" },
} satisfies Meta<ComponentProps<typeof SettingsStory>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Configured: Story = { args: { status: true, tokenResult: { configured: false } } };

export const NotConfigured: Story = { args: { status: false, tokenResult: { configured: true } } };

export const Loading: Story = { args: {} };
