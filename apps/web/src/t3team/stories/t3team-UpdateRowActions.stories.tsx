import type { Meta, StoryObj } from "@storybook/react";
import { EnvironmentId } from "@t3tools/contracts";

import { DesktopUpdateStatusIcon } from "~/components/sidebar/DesktopUpdateStatusIcon";
import { UpdateEntryChip } from "~/components/sidebar/t3team-UpdateEntryChip";
import { UpdateNotesBadge } from "~/components/sidebar/t3team-UpdateNotesBadge";
import { UpdatePopoverNotes } from "~/components/sidebar/t3team-UpdatePopoverNotes";
import { UpdateReleaseNotesList } from "~/components/sidebar/t3team-UpdateReleaseNotesList";
import {
  type UpdateEntry,
  UpdateEverythingDialog,
} from "~/components/sidebar/UpdateEverythingDialog";
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

const VIEW = {
  version: "0.1.2-rc.25",
  releasedAt: "2026-11-14",
  releaseUrl: "https://nexplore.ghe.com/hive/nx-nexi/releases/tag/desktop-v0.1.2-rc.25",
  notes: [
    "The update pill shows a dot until you open what changed",
    "Update one machine or provider at a time from the update dialog",
    "A phone cloud session starts behind an open draft, never ending in an error",
  ],
};

const renderEntry = (row: UpdateEverythingRow, entry: UpdateEntry) => (
  <UpdateEntryChip
    label={entry.label}
    action={{
      label:
        entry.kind === "app"
          ? row.app === "this-app"
            ? "Download this app's update"
            : `Update ${row.label}`
          : `Update ${entry.label} on ${row.label}`,
      icon: entry.kind === "app" && row.app === "this-app" ? "download" : "update",
      restartEnvironmentId:
        entry.kind === "app" && row.app !== "this-app" ? row.environmentId : null,
      pending: entry.kind === "provider" && row.label === "build-box",
      onClick: () => undefined,
    }}
  />
);

function UpdateStory({ view }: { readonly view: "today" | "rows" | "popover" | "badge" }) {
  if (view === "popover") {
    return (
      <div className="w-fit rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
        <UpdatePopoverNotes title="Update this app, 1 server and 3 providers" view={VIEW}>
          <UpdateReleaseNotesList
            heading="What's changed"
            notes={VIEW.notes}
            releaseUrl={VIEW.releaseUrl}
            onOpenHistory={() => undefined}
          />
        </UpdatePopoverNotes>
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
