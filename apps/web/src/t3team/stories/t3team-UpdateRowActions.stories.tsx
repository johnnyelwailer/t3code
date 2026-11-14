import type { Meta, StoryObj } from "@storybook/react";
import type { DesktopUpdateState } from "@t3tools/contracts";

import { DesktopUpdateStatusIcon } from "~/components/sidebar/DesktopUpdateStatusIcon";
import { SidebarUpdateReleaseNotes } from "~/components/sidebar/SidebarUpdateReleaseNotes";
import { UpdateNotesBadge } from "~/components/sidebar/t3team-UpdateNotesBadge";
import { useUpdateRowActions } from "~/components/sidebar/t3team-useUpdateRowActions";
import { UpdateEverythingDialog } from "~/components/sidebar/UpdateEverythingDialog";
import {
  STORY_ROWS,
  STORY_SERVERS,
  STORY_VERSION,
} from "~/t3team/stories/t3team-updateRowActions.storyFixtures";

const UPDATE: DesktopUpdateState = {
  enabled: true,
  status: "available",
  channel: "latest",
  currentVersion: "0.1.2-rc.24",
  hostArch: "arm64",
  appArch: "arm64",
  runningUnderArm64Translation: false,
  availableVersion: STORY_VERSION,
  downloadedVersion: null,
  releaseNotes: [
    {
      version: STORY_VERSION,
      releasedAt: "2026-11-14",
      totalItems: 3,
      items: [
        "The update pill shows a dot until you open what changed",
        "Update one machine or provider at a time from the update dialog",
        "A phone cloud session starts behind an open draft, never ending in an error",
      ],
    },
  ],
  omittedReleaseCount: 0,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: false,
};

function UpdateDialog({ action }: { readonly action: "download" | "install" | null }) {
  const renderEntry = useUpdateRowActions(
    STORY_ROWS,
    STORY_SERVERS,
    action ?? "download",
    () => undefined,
  );
  return (
    <UpdateEverythingDialog
      open
      onOpenChange={() => undefined}
      version={STORY_VERSION}
      providerCount={8}
      rows={STORY_ROWS}
      restarts={[]}
      onConfirm={() => undefined}
      renderEntry={action === null ? null : renderEntry}
    />
  );
}

function UpdateStory({
  view,
}: {
  readonly view: "today" | "download" | "restart" | "popover" | "badge";
}) {
  if (view === "popover") {
    return (
      <div className="w-fit rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
        <SidebarUpdateReleaseNotes
          shell={undefined}
          state={UPDATE}
          tooltip="Update this app, 2 servers and 8 providers"
        />
      </div>
    );
  }
  if (view === "badge") {
    return (
      <div className="flex gap-3 rounded-xl bg-sidebar p-3 text-sidebar-foreground">
        {(["available", "everything"] as const).map((status) => (
          <span
            key={status}
            className="relative inline-flex size-8 items-center justify-center rounded-full bg-sidebar-control-surface"
          >
            <DesktopUpdateStatusIcon status={status} />
            <UpdateNotesBadge />
          </span>
        ))}
      </div>
    );
  }
  const action = view === "today" ? null : view === "restart" ? "install" : "download";
  return <UpdateDialog action={action} />;
}

const meta = {
  title: "T3Team/Sidebar/Update Row Actions",
  component: UpdateStory,
} satisfies Meta<typeof UpdateStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Today: Story = { args: { view: "today" } };
export const RowActions: Story = { args: { view: "download" } };
export const RowActionsRestart: Story = { args: { view: "restart" } };
export const NotesPopover: Story = { args: { view: "popover" } };
export const PillBadge: Story = { args: { view: "badge" } };
