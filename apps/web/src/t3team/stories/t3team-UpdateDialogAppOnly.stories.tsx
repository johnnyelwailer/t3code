import type { Meta, StoryObj } from "@storybook/react";
import { EnvironmentId } from "@t3tools/contracts";

import { UpdateEverythingDialog } from "~/components/sidebar/UpdateEverythingDialog";
import { UpdateReleaseNotesList } from "~/components/sidebar/t3team-UpdateReleaseNotesList";
import { UpdatePopoverNotes } from "~/components/sidebar/t3team-useUpdateDialogAppOnly";
import type { UpdateEverythingRow } from "~/components/sidebar/updateEverything.logic";

const ROWS: ReadonlyArray<UpdateEverythingRow> = [
  {
    environmentId: null,
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

const NOTES = [
  "The update dialog lists what changed",
  "A phone cloud session starts behind an open draft, never ending in an error",
  "Project pills are 48 dp touch targets in one swipe strip",
];

const notesList = (
  <UpdateReleaseNotesList
    heading="What's changed"
    notes={NOTES}
    releaseUrl="https://nexplore.ghe.com/hive/nx-nexi/releases/tag/desktop-v0.1.2-rc.24"
    onOpenHistory={() => undefined}
  />
);

function UpdateDialogStory({
  appOnly,
  hover = false,
}: {
  readonly appOnly: boolean;
  readonly hover?: boolean;
}) {
  if (hover) {
    return (
      <div className="w-fit rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
        <UpdatePopoverNotes title="Update everything">{notesList}</UpdatePopoverNotes>
      </div>
    );
  }
  return (
    <UpdateEverythingDialog
      open
      onOpenChange={() => undefined}
      version="0.1.2-rc.24"
      providerCount={3}
      rows={ROWS}
      restarts={[]}
      onConfirm={() => undefined}
      {...(appOnly
        ? {
            releaseNotes: notesList,
            secondaryAction: { label: "Download app only", onClick: () => undefined },
          }
        : {})}
    />
  );
}

const meta = {
  title: "T3Team/Sidebar/Update Dialog App Only",
  component: UpdateDialogStory,
} satisfies Meta<typeof UpdateDialogStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Today: Story = { args: { appOnly: false } };
export const NotesAndAppOnly: Story = { args: { appOnly: true } };
export const HoverNotes: Story = { args: { appOnly: true, hover: true } };
