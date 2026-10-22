import type { Meta, StoryObj } from "@storybook/react";
import { useMemo } from "react";

import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import { createMockBackend } from "~/t3team/backend/t3team-mockBackend";
import { withT3TeamRouter } from "~/t3team/storybook/t3team-storybook-router-decorator";
import { ProjectDashboardKickoffComposer } from "~/t3team/t3team-ProjectDashboardKickoffComposer";

/**
 * The kickoff ("start a new thread") composer keeps unsent text across a reload
 * or app restart: type something, reload the canvas, and it is still there.
 * Text is written through to localStorage under `project:<projectId>`.
 */
function KickoffComposerDraftRestorePreview() {
  const backend = useMemo(() => createMockBackend(), []);
  return (
    <BackendProvider backend={backend}>
      <div className="flex min-h-screen flex-col justify-end bg-background text-foreground">
        <ProjectDashboardKickoffComposer
          providers={[]}
          isConnected
          projectId="storybook-demo-project"
          injectedContextAttachments={[]}
          onRemoveContextAttachment={() => {}}
          onSubmit={() => {}}
        />
      </div>
    </BackendProvider>
  );
}

const meta = {
  title: "T3Team/Kickoff/Composer Draft Restore",
  component: KickoffComposerDraftRestorePreview,
  decorators: [withT3TeamRouter],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof KickoffComposerDraftRestorePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
