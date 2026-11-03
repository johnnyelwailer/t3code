import type { Meta, StoryObj } from "@storybook/react";
import type { DesktopUpdateState } from "@t3tools/contracts";
import { useState } from "react";
import { getDesktopUpdateIdleTooltip } from "~/components/desktopUpdate.logic";
import { DesktopUpdateStatusIcon } from "~/components/sidebar/DesktopUpdateStatusIcon";
import { NexiUpdateNoticeView } from "~/components/sidebar/t3team-NexiUpdateNoticeView";
import { getNexiUpdateNoticeView } from "~/components/sidebar/t3team-nexiUpdateNotice.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

function UpdateFooterStory({ ready = false }: { ready?: boolean }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const state: DesktopUpdateState = {
    enabled: true,
    status: ready ? "downloaded" : "error",
    channel: "latest",
    currentVersion: "0.1.2-rc.7",
    hostArch: "x64",
    appArch: "x64",
    runningUnderArm64Translation: false,
    availableVersion: ready ? "0.1.2-rc.8" : null,
    downloadedVersion: ready ? "0.1.2-rc.8" : null,
    releaseNotes: [{ version: "0.1.2-rc.8", items: ["Quieter update checks."], totalItems: 1 }],
    omittedReleaseCount: 0,
    downloadPercent: ready ? 100 : null,
    checkedAt: null,
    message: ready ? null : "The local backend is not ready.",
    errorContext: ready ? null : "check",
    canRetry: true,
    feed: "nexi-ghe",
    issue: "unreachable",
    nextCheckAt: "2026-11-02T13:30:00Z",
  };
  const failure = getDesktopUpdateIdleTooltip(state);
  const view = getNexiUpdateNoticeView(state, dismissed);
  return (
    <div className="flex w-72 max-w-full flex-col gap-3 rounded-xl bg-sidebar p-3 text-sidebar-foreground">
      <div className="h-40">
        <strong>Nexi Work</strong>
        <p>Projects</p>
        <p>Update status footer icon</p>
      </div>
      {view ? (
        <NexiUpdateNoticeView
          view={view}
          busy={false}
          onAction={() => {}}
          onLater={() => setDismissed(state.downloadedVersion)}
        />
      ) : null}
      <div className="flex items-center justify-between border-t border-sidebar-border pt-2">
        <span>Settings</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={
                  ready ? "Restart to install update" : `${failure.title}. ${failure.detail ?? ""}`
                }
                className="inline-flex size-8 items-center justify-center rounded-full text-(--sidebar-icon-color) hover:bg-sidebar-row-hover"
                onClick={() => setChecking(true)}
              >
                <DesktopUpdateStatusIcon
                  status={checking ? "checking" : ready ? "downloaded" : "error"}
                />
              </button>
            }
          />
          <TooltipPopup side="top">
            {checking
              ? "Checking for updates..."
              : ready
                ? "Restart to install update"
                : `${failure.title}. ${failure.detail ?? ""}`}
          </TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
}
const meta = {
  title: "T3Team/Sidebar/Nexi Update Footer",
  component: UpdateFooterStory,
} satisfies Meta<typeof UpdateFooterStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FailedCheck: Story = {};
export const ReadyToInstall: Story = { args: { ready: true } };
