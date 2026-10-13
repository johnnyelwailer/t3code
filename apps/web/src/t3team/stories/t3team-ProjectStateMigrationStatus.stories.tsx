import type { Meta, StoryObj } from "@storybook/react";
import type { ProjectStateMigration } from "@t3tools/contracts";

import { MainRepositoryPicker } from "~/t3team/components/t3team-MainRepositoryPicker";
import { ProjectStateMigrationStatusLine } from "~/t3team/components/t3team-ProjectStateMigrationStatusLine";
import { Card } from "~/t3team/components/ui/t3team-card";

const ALPHA = "https://nexplore.ghe.com/hive/ies-alarm";
const BETA = "https://nexplore.ghe.com/hive/ies-base-libs";

const migration = (overrides: Partial<ProjectStateMigration>): ProjectStateMigration => ({
  migrationId: "m-1",
  status: "running",
  fromRoot: "~/.t3code/t3team/projects/IES NG",
  toRoot: "~/.t3code/t3team/projects/IES NG/.nexi/references/01-ies-alarm",
  stateDir: ".nexi",
  excludes: [],
  missingFilesAtLeast: 50_000,
  startedAt: "2026-10-11T10:00:00.000Z",
  updatedAt: "2026-10-11T10:00:00.000Z",
  ...overrides,
});

/** The main-repository section of the Linked repositories dialog, right after a save. */
function Frame({ state }: { state: ProjectStateMigration | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-2xl overflow-hidden">
        <div className="px-4 py-3">
          <MainRepositoryPicker
            repositoryUrls={[ALPHA, BETA]}
            candidates={[]}
            value={ALPHA}
            onChange={() => {}}
          />
          <ProjectStateMigrationStatusLine migration={state} />
        </div>
        <footer className="flex items-center border-t border-border bg-card px-5 py-3.5">
          <span className="text-xs text-muted-foreground">
            2 linked · saved, repositories sync in the background
          </span>
        </footer>
      </Card>
    </div>
  );
}

const meta = {
  title: "T3Team/Project State Migration",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Starting: Story = {
  render: () => <Frame state={migration({ status: "pending" })} />,
};
export const Running: Story = {
  render: () => <Frame state={migration({})} />,
};
export const Completed: Story = {
  render: () => (
    <Frame
      state={migration({
        status: "completed",
        conflicts: 3,
        pullRequestUrl: "https://nexplore.ghe.com/hive/ies-alarm/pull/42",
      })}
    />
  ),
};
export const Failed: Story = {
  render: () => (
    <Frame state={migration({ status: "failed", error: "The migration run was cancelled." })} />
  ),
};
export const InlineOrNone: Story = {
  render: () => <Frame state={null} />,
};
