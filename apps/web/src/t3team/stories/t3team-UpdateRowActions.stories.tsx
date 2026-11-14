import type { Meta, StoryObj } from "@storybook/react";
import { type DesktopUpdateState, EnvironmentId } from "@t3tools/contracts";

import { DesktopUpdateStatusIcon } from "~/components/sidebar/DesktopUpdateStatusIcon";
import { UpdateEntryChip } from "~/components/sidebar/t3team-UpdateEntryChip";
import { UpdateNotesBadge } from "~/components/sidebar/t3team-UpdateNotesBadge";
import { SidebarUpdateReleaseNotes } from "~/components/sidebar/SidebarUpdateReleaseNotes";
import type { UpdateEntryCell } from "~/components/sidebar/t3team-updateEntryCell";
import { UpdateEverythingDialog } from "~/components/sidebar/UpdateEverythingDialog";
import type { UpdateEverythingRow } from "~/components/sidebar/updateEverything.logic";

const ROWS: ReadonlyArray<UpdateEverythingRow> = [
  {
    environmentId: EnvironmentId.make("env-this-mac"),
    label: "This Mac",
    app: "this-app",
    providers: ["Claude", "Codex"],
    skipped: null,
  },
  {
    environmentId: EnvironmentId.make("env-build-box"),
    label: "build-box",
    app: "server",
    providers: ["Claude"],
    skipped: null,
  },
];

const UPDATE: DesktopUpdateState = {
  enabled: true,
  status: "available",
  channel: "latest",
  currentVersion: "0.1.2-rc.24",
  hostArch: "arm64",
  appArch: "arm64",
  runningUnderArm64Translation: false,
  availableVersion: "0.1.2-rc.25",
  downloadedVersion: null,
  releaseNotes: [
    {
      version: "0.1.2-rc.25",
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

const chip = (label: string, actionLabel: string, icon: "download" | "update", pending = false) => (
  <UpdateEntryChip
    key={label}
    label={label}
    action={{
      label: actionLabel,
      icon,
      restartEnvironmentIds: [],
      pending,
      onClick: () => undefined,
    }}
  />
);

const renderEntry = (row: UpdateEverythingRow, cell: UpdateEntryCell) =>
  cell.kind === "app" ? (
    row.app === "this-app" ? (
      chip(cell.label, "Download this app's update", "download")
    ) : (
      chip(cell.label, `Update ${row.label}`, "update")
    )
  ) : (
    <span className="flex flex-wrap items-start gap-1">
      {row.providers.map((provider) =>
        chip(provider, `Update ${provider} on ${row.label}`, "update", row.label === "build-box"),
      )}
    </span>
  );

function UpdateStory({ view }: { readonly view: "today" | "rows" | "popover" | "badge" }) {
  if (view === "popover") {
    return (
      <div className="w-fit rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
        <SidebarUpdateReleaseNotes
          shell={undefined}
          state={UPDATE}
          tooltip="Update this app, 1 server and 3 providers"
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
  return (
    <UpdateEverythingDialog
      open
      onOpenChange={() => undefined}
      version="0.1.2-rc.25"
      providerCount={3}
      rows={ROWS}
      restarts={[]}
      onConfirm={() => undefined}
      renderEntry={view === "rows" ? renderEntry : null}
    />
  );
}

const meta = {
  title: "T3Team/Sidebar/Update Row Actions",
  component: UpdateStory,
} satisfies Meta<typeof UpdateStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Today: Story = { args: { view: "today" } };
export const RowActions: Story = { args: { view: "rows" } };
export const NotesPopover: Story = { args: { view: "popover" } };
export const PillBadge: Story = { args: { view: "badge" } };
