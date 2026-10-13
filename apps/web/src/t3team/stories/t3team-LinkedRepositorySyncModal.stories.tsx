import type { Meta, StoryObj } from "@storybook/react";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { LinkedRepositorySyncModal } from "~/t3team/components/t3team-LinkedRepositorySyncModal";
import {
  buildSyncSteps,
  type LinkedRepositorySavePhase,
} from "~/t3team/components/t3team-linkedRepositorySyncSteps";

const URLS = [
  "https://nexplore.ghe.com/hive/ies-base-libs",
  "https://nexplore.ghe.com/hive/ies-base-notifications",
  "https://nexplore.ghe.com/hive/common-agentdirectives",
  "https://nexplore.ghe.com/hive/ops",
];
const MAIN = URLS[2];

const entry = (
  url: string,
  patch: Partial<LinkedRepositorySyncResult>,
): LinkedRepositorySyncResult => ({ url, localPath: "/references", status: "cloned", ...patch });

function stepsFor(
  phase: LinkedRepositorySavePhase,
  byUrl: ReadonlyArray<LinkedRepositorySyncResult>,
) {
  return buildSyncSteps({
    phase,
    urls: URLS,
    byUrl: new Map(byUrl.map((item) => [item.url, item])),
    ...(MAIN ? { mainRepositoryUrl: MAIN } : {}),
  });
}

const frame = (Story: () => React.ReactElement) => (
  <div className="relative flex h-[34rem] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card">
    <Story />
  </div>
);

/** The sync view that covers the Linked repositories dialog while a save and its clones run. */
const meta = {
  title: "T3Team/Linked Repositories/Sync progress",
  component: LinkedRepositorySyncModal,
  decorators: [frame],
  args: { onContinueInBackground: () => {} },
} satisfies Meta<typeof LinkedRepositorySyncModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LargeFirstClone: Story = {
  args: {
    steps: stepsFor("waiting-for-main", [
      entry(URLS[0] ?? "", {}),
      entry(URLS[1] ?? "", {}),
      entry(URLS[2] ?? "", { status: "pending", syncState: "cloning" }),
      entry(URLS[3] ?? "", { status: "pending", syncState: "queued" }),
    ]),
  },
};

export const Failed: Story = {
  args: {
    steps: stepsFor("saved", [
      entry(URLS[0] ?? "", {}),
      entry(URLS[1] ?? "", {}),
      entry(URLS[2] ?? "", {
        status: "failed",
        error: "FileSystem.rename: the clone could not be moved into place",
      }),
      entry(URLS[3] ?? "", {}),
    ]),
  },
};

export const AllDone: Story = {
  args: {
    steps: stepsFor(
      "saved",
      URLS.map((url) => entry(url, {})),
    ),
  },
};
