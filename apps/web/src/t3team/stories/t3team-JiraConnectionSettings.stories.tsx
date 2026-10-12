import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentProps } from "react";

import { JiraConnectionSettings } from "~/components/settings/t3team-JiraConnectionSettings";
import type { AtlassianAccountStatus } from "~/t3team/backend/t3team-atlassianAccountStatus";
import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import { createMockBackend } from "~/t3team/backend/t3team-mockBackend";

const HOUR = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

const connected: AtlassianAccountStatus = {
  id: "cloud-nexplore",
  provider: "atlassian",
  label: "Philip Jonientz",
  accountUrl: "https://nexplore.atlassian.net",
  status: "connected",
  needsReconnect: false,
  lastSyncAt: hoursAgo(0.2),
};

function SettingsStory({ accounts }: { readonly accounts: ReadonlyArray<AtlassianAccountStatus> }) {
  const mock = createMockBackend();
  const backend = {
    ...mock,
    atlassian: {
      ...mock.atlassian,
      listAccountStatuses: async () => accounts,
      disconnectAccount: async () => {},
    },
  };
  return (
    <BackendProvider backend={backend}>
      <div className="mx-auto w-[560px] max-w-full">
        <JiraConnectionSettings />
      </div>
    </BackendProvider>
  );
}

const meta = {
  title: "T3Team/Settings/Jira Connection",
  component: SettingsStory,
  parameters: { layout: "padded" },
} satisfies Meta<ComponentProps<typeof SettingsStory>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = { args: { accounts: [connected] } };

export const NeedsSignIn: Story = {
  args: {
    accounts: [
      {
        ...connected,
        status: "needs-reconnect",
        needsReconnect: true,
        lastSyncAt: hoursAgo(26 * 24),
      },
    ],
  },
};

export const StaleSync: Story = {
  args: { accounts: [{ ...connected, lastSyncAt: hoursAgo(26 * 24) }] },
};

export const SyncError: Story = {
  args: {
    accounts: [
      {
        ...connected,
        lastSyncAt: hoursAgo(5),
        lastSyncError: "Jira did not answer the last three syncs.",
      },
    ],
  },
};

export const TwoSites: Story = {
  args: {
    accounts: [
      connected,
      {
        id: "cloud-partner",
        provider: "atlassian",
        label: "Philip Jonientz",
        accountUrl: "https://partner.atlassian.net",
        status: "needs-reconnect",
        needsReconnect: true,
      },
    ],
  },
};

export const NotConnected: Story = { args: { accounts: [] } };
