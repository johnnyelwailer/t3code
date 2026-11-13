import type { Meta, StoryObj } from "@storybook/react";
import type { DesktopUpdateState } from "@t3tools/contracts";
import { useState } from "react";
import { getDesktopUpdateIdleTooltip } from "~/components/desktopUpdate.logic";
import { DesktopUpdateStatusIcon } from "~/components/sidebar/DesktopUpdateStatusIcon";
import { NexiUpdateReadyFooter } from "~/components/sidebar/t3team-NexiUpdateReadyFooter";
import { getNexiUpdateNoticeView } from "~/components/sidebar/t3team-nexiUpdateNotice.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

const GHE = "https://nexplore.ghe.com/hive/nx-nexi/pull";
const RC8_TITLES = [
  `fix(publish): do not bundle ffi-rs into the server tarball; a smoke step that shows its errors by @pj in ${GHE}/984`,
  `chore: pin vendor/t3code to fork main 898a0deca9 (Windows payload budget fix) by @pj in ${GHE}/986`,
  `chore: pin vendor/t3code to fork main e203574893 (upstream sync v0.1.6+, environment filter, mobile draft fixes) by @pj in ${GHE}/975`,
  `fix(nexi-work): a phone cloud session starts behind an open draft, never ending in an error by @pj in ${GHE}/816`,
  `fix(nexi-work): project pills are 48 dp touch targets in one swipe strip (#951) by @pj in ${GHE}/953`,
];

function fixtureState(ready: boolean): DesktopUpdateState {
  return {
    enabled: true,
    status: ready ? "downloaded" : "error",
    channel: "latest",
    currentVersion: "0.1.2-rc.7",
    hostArch: "x64",
    appArch: "x64",
    runningUnderArm64Translation: false,
    availableVersion: ready ? "0.1.2-rc.8" : null,
    downloadedVersion: ready ? "0.1.2-rc.8" : null,
    releaseNotes: [{ version: "0.1.2-rc.8", items: RC8_TITLES, totalItems: RC8_TITLES.length }],
    omittedReleaseCount: 0,
    downloadPercent: ready ? 100 : null,
    checkedAt: null,
    message: ready ? null : "The local backend is not ready.",
    errorContext: ready ? null : "check",
    canRetry: true,
    feed: "nexi-ghe",
    ...(ready
      ? { releaseUrl: "https://nexplore.ghe.com/hive/nx-nexi/releases/tag/desktop-v0.1.2-rc.8" }
      : {}),
    issue: "unreachable",
    nextCheckAt: "2026-11-02T13:30:00Z",
  };
}

function FailedIcon({ state }: { readonly state: DesktopUpdateState }) {
  const [checking, setChecking] = useState(false);
  const failure = getDesktopUpdateIdleTooltip(state);
  const text = checking ? "Checking for updates..." : `${failure.title}. ${failure.detail ?? ""}`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={text}
            className="inline-flex size-8 items-center justify-center rounded-full text-(--sidebar-icon-color) hover:bg-sidebar-row-hover"
            onClick={() => setChecking(true)}
          >
            <DesktopUpdateStatusIcon status={checking ? "checking" : "error"} />
          </button>
        }
      />
      <TooltipPopup side="top">{text}</TooltipPopup>
    </Tooltip>
  );
}

function UpdateFooterStory({
  ready = false,
  dismissed = false,
}: {
  ready?: boolean;
  dismissed?: boolean;
}) {
  if (dismissed) localStorage.setItem("nexi.update.dismissedVersion", "0.1.2-rc.8");
  else localStorage.removeItem("nexi.update.dismissedVersion");
  localStorage.setItem("nexi.update.notifiedVersion", "0.1.2-rc.8");
  const state = fixtureState(ready);
  const view = getNexiUpdateNoticeView(state);
  return (
    <div className="flex w-72 max-w-full flex-col gap-3 rounded-xl bg-sidebar p-3 text-sidebar-foreground">
      <div className="h-64">
        <strong>Nexi Work</strong>
        <p>Projects</p>
        <p>Nothing about the update appears up here.</p>
      </div>
      <ul className="flex items-center justify-between border-t border-sidebar-border pt-2">
        <li>Settings</li>
        {view ? <NexiUpdateReadyFooter view={view} /> : <FailedIcon state={state} />}
      </ul>
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
export const ReadyDismissed: Story = { args: { ready: true, dismissed: true } };
export const ReadyPopoverOpen: Story = {
  args: { ready: true },
  play: async ({ canvasElement }) => {
    const icon = canvasElement.querySelector<HTMLButtonElement>(
      '[data-testid="nexi-update-ready-icon"]',
    );
    icon?.click();
  },
};
