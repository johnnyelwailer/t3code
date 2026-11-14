import { type DesktopUpdateState, EnvironmentId } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import type { ServerUpdateTarget } from "../ServerUpdateAction";
import { SidebarProvider, useSidebar } from "../ui/sidebar";
import { mocks, notifyUpdateListeners, setCurrentUpdate, VERSION } from "./t3team-updatePill.mocks";
import type { UpdateEverythingRow } from "./updateEverything.logic";

export { mocks, VERSION } from "./t3team-updatePill.mocks";

export function update(overrides: Partial<DesktopUpdateState> = {}): DesktopUpdateState {
  return {
    enabled: true,
    status: "available",
    channel: "nightly",
    currentVersion: "0.0.50-nightly.1",
    hostArch: "arm64",
    appArch: "arm64",
    runningUnderArm64Translation: false,
    availableVersion: VERSION,
    downloadedVersion: null,
    releaseNotes: [{ version: VERSION, items: ["Faster sidebar."], totalItems: 1 }],
    omittedReleaseCount: 0,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    errorContext: null,
    canRetry: false,
    ...overrides,
  };
}

export const nexiReady = () =>
  update({ status: "downloaded", downloadedVersion: VERSION, feed: "nexi-ghe" });

export const APP_ROW: UpdateEverythingRow = {
  environmentId: null,
  label: "This app",
  app: "this-app",
  providers: [],
  skipped: null,
};
export const BOX_ROW: UpdateEverythingRow = {
  environmentId: EnvironmentId.make("env-box"),
  label: "build-box",
  app: "server",
  providers: ["Claude"],
  skipped: null,
};
export const BOX_SERVER: ServerUpdateTarget = {
  environmentId: EnvironmentId.make("env-box"),
  serverLabel: "build-box",
  selfUpdate: null,
  targetVersion: VERSION,
};

export function setup(
  state: DesktopUpdateState,
  {
    hasUpdates = false,
    flag = true,
    popped = true,
    rows = [APP_ROW, BOX_ROW],
  }: {
    hasUpdates?: boolean;
    flag?: boolean;
    popped?: boolean;
    rows?: ReadonlyArray<UpdateEverythingRow>;
  } = {},
) {
  setCurrentUpdate(state);
  mocks.hasUpdates = hasUpdates;
  mocks.flag = flag;
  mocks.rows = [...rows];
  mocks.servers = [BOX_SERVER];
  for (const fn of [mocks.runEverything, mocks.confirm, mocks.updateServer, mocks.updateProvider]) {
    fn.mockReset();
  }
  mocks.updateServer.mockResolvedValue({ status: "updated" });
  mocks.updateProvider.mockResolvedValue(undefined);
  localStorage.removeItem("update.notes.seenVersion");
  localStorage.removeItem("nexi.update.dismissedVersion");
  localStorage.setItem("nexi.update.notifiedVersion", VERSION);
  if (popped) localStorage.setItem("update.notes.poppedVersion", VERSION);
  else localStorage.removeItem("update.notes.poppedVersion");
}

/** Republishes the update state, as the desktop bridge does when other updates appear. */
export function publish(changes: { readonly hasUpdates: boolean }) {
  return act(() => {
    mocks.hasUpdates = changes.hasUpdates;
    notifyUpdateListeners();
  });
}

function ToggleSidebar() {
  const { toggleSidebar } = useSidebar();
  return (
    <button type="button" onClick={toggleSidebar}>
      Toggle sidebar
    </button>
  );
}

export async function renderInSidebar(pill: ReactNode, { open = true } = {}) {
  await page.viewport(1280, 800);
  return render(
    <SidebarProvider defaultOpen={open}>
      <ToggleSidebar />
      {pill}
      <button type="button" className="mt-96">
        Elsewhere
      </button>
    </SidebarProvider>,
  );
}

export const badge = () => document.querySelector('[data-testid="update-notes-badge"]');
export const releaseNotes = () => document.querySelector('[aria-label="Update release notes"]');
export const popped = () => localStorage.getItem("update.notes.poppedVersion");

/** A click on another control outside the popover, as a user dismisses it. */
export const clickAway = () => userEvent.click(page.getByRole("button", { name: "Elsewhere" }));
