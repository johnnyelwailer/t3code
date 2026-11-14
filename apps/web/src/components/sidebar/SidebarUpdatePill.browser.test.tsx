import type { DesktopUpdateState } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { act, render, stubGlobal } from "../../../test/render";
import { toastManager } from "../ui/toast";
import { SidebarUpdatePill } from "./SidebarUpdatePill";

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    update: null as DesktopUpdateState | null,
    hasUpdates: false,
    appOnly: false,
    runEverything: vi.fn(),
    confirm: vi.fn(),
    updateServer: vi.fn(),
    updateProvider: vi.fn(),
    rows: [] as unknown[],
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify: () => {
      for (const listener of listeners) listener();
    },
  };
});
vi.mock("../../state/desktopUpdate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/desktopUpdate")>()),
  useDesktopUpdateState: (await import("react")).useSyncExternalStore.bind(
    null,
    mocks.subscribe,
    () => mocks.update,
  ),
}));
// The pill only renders in the desktop app.
vi.mock("../../env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../env")>()),
  isElectron: true,
}));
const BUILD_BOX_SERVER = vi.hoisted(() => ({ environmentId: "env-box", serverLabel: "build-box" }));
vi.mock("./useUpdateEverything", () => ({
  useUpdateEverything: () => ({
    hasUpdates: mocks.hasUpdates,
    summary: "Update everything",
    version: null,
    providerCount: 0,
    rows: mocks.rows,
    restarts: [],
    run: mocks.runEverything,
  }),
  isHostedByThisApp: () => false,
}));
vi.mock("./t3team-useUpdateEntryTargets", () => ({
  useUpdateEntryTargets: () => [BUILD_BOX_SERVER],
}));
vi.mock("../ServerUpdateAction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ServerUpdateAction")>()),
  useServerUpdate: () => mocks.updateServer,
}));
const CLAUDE = vi.hoisted(() => ({ driver: "claudeAgent" }));
vi.mock("./t3team-useProviderEntryUpdate", () => ({
  useProviderEntryUpdate: () => ({
    machines: [{ environmentId: "env-box", label: "build-box", candidates: [CLAUDE] }],
    update: mocks.updateProvider,
  }),
}));
vi.mock("../../localApi", () => ({
  ensureLocalApi: () => ({ dialogs: { confirm: mocks.confirm } }),
}));
vi.mock("~/t3team/t3team-useFeatureFlag", () => ({
  useFeatureFlag: (key: string) => key === "UI_UPDATE_APP_ONLY" && mocks.appOnly,
}));

function nightlyUpdate(releaseNotes: DesktopUpdateState["releaseNotes"]): DesktopUpdateState {
  return {
    enabled: true,
    status: "available",
    channel: "nightly",
    currentVersion: "0.0.50-nightly.1",
    hostArch: "arm64",
    appArch: "arm64",
    runningUnderArm64Translation: false,
    availableVersion: "0.0.50-nightly.2",
    downloadedVersion: null,
    releaseNotes,
    omittedReleaseCount: 0,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

const RELEASE_NOTES: DesktopUpdateState["releaseNotes"] = [
  { version: "0.0.50-nightly.2", items: ["Faster sidebar."], totalItems: 1 },
];

const APP_ROW = {
  environmentId: null,
  label: "This app",
  app: "this-app",
  providers: [],
  skipped: null,
};
const BOX_ROW = {
  environmentId: "env-box",
  label: "build-box",
  app: "server",
  providers: ["Claude"],
  skipped: null,
};

function setup(
  update: DesktopUpdateState | null,
  { hasUpdates = false, appOnly = false, popped = true, rows = [APP_ROW, BOX_ROW] } = {},
) {
  mocks.update = update;
  mocks.hasUpdates = hasUpdates;
  mocks.appOnly = appOnly;
  mocks.rows = rows;
  for (const fn of [mocks.runEverything, mocks.confirm, mocks.updateServer, mocks.updateProvider]) {
    fn.mockReset();
  }
  mocks.updateServer.mockResolvedValue({ status: "updated" });
  mocks.updateProvider.mockResolvedValue(undefined);
  localStorage.removeItem("update.notes.seenVersion");
  if (popped) localStorage.setItem("update.notes.poppedVersion", "0.0.50-nightly.2");
  else localStorage.removeItem("update.notes.poppedVersion");
}

const badge = () => document.querySelector('[data-testid="update-notes-badge"]');

function publish(update: DesktopUpdateState | null) {
  return act(() => {
    mocks.update = update;
    mocks.notify();
  });
}

const releaseNotes = () => document.querySelector('[aria-label="Update release notes"]');

describe("SidebarUpdatePill release notes", () => {
  it("closes when the release notes stop applying", async () => {
    setup(nightlyUpdate(RELEASE_NOTES));
    await using _screen = await render(<SidebarUpdatePill />);
    await userEvent.tab();
    await vi.waitFor(() => expect(releaseNotes()).not.toBeNull());

    await publish(nightlyUpdate([]));
    await vi.waitFor(() => expect(releaseNotes()).toBeNull());
  });

  it("opens when release notes arrive while the trigger has keyboard focus", async () => {
    setup(nightlyUpdate([]));
    await using _screen = await render(<SidebarUpdatePill />);
    await userEvent.tab();
    expect(releaseNotes()).toBeNull();

    await publish(
      nightlyUpdate([
        {
          version: "0.0.50-nightly.2",
          items: ["**One-time tasks.** Pick a date."],
          totalItems: 1,
          stats: "3 changes from 2 contributors",
          footer: "Plus 2 more bug fixes.",
        },
      ]),
    );
    await expect.element(page.getByText("One-time tasks.", { exact: true })).toBeVisible();
    await expect.element(page.getByText("Plus 2 more bug fixes.")).toBeVisible();
  });
});

describe("SidebarUpdatePill plain notes", () => {
  it("shows the dialog's notes list on hover behind the flag", async () => {
    setup(
      nightlyUpdate([
        { ...RELEASE_NOTES[0]!, items: ["fix(web): faster sidebar"], releasedAt: "2026-11-13" },
      ]),
      {
        appOnly: true,
        hasUpdates: true,
      },
    );
    await using _screen = await render(<SidebarUpdatePill />);
    await userEvent.tab();
    const notes = page.getByRole("region", { name: "What's changed" });
    await expect.element(notes.getByText("Faster sidebar")).toBeVisible();
    await expect.element(page.getByText(/^0\.0\.50-nightly\.2 · /)).toBeVisible();
  });

  it("opens the notes with the update action on click when only the app updates", async () => {
    const state = nightlyUpdate(RELEASE_NOTES);
    setup(state, { appOnly: true });
    const downloadUpdate = vi.fn().mockResolvedValue({ accepted: true, completed: true, state });
    using _bridge = stubGlobal("desktopBridge", { downloadUpdate });
    await using screen = await render(<SidebarUpdatePill />);
    await userEvent.click(screen.getByRole("button", { name: /ready to download/ }));
    const notes = page.getByRole("region", { name: "What's changed" });
    await expect.element(notes.getByText("Faster sidebar.")).toBeVisible();
    expect(downloadUpdate).not.toHaveBeenCalled();

    await userEvent.click(page.getByRole("button", { name: "Download now" }));
    await vi.waitFor(() => expect(downloadUpdate).toHaveBeenCalledOnce());
  });
});

describe("SidebarUpdatePill update everything", () => {
  it("does not refocus the update button after a pointer cancel", async () => {
    setup(null, { hasUpdates: true });
    await using screen = await render(<SidebarUpdatePill />);
    const button = screen.getByRole("button", { name: "Update everything" });
    await userEvent.click(button);
    const cancel = page.getByRole("button", { name: "Cancel" });
    await expect.element(cancel).toBeVisible();

    await userEvent.click(cancel);
    await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull());
    expect(document.activeElement).not.toBe(button.element());
  });

  it("returns focus to the update button after Escape", async () => {
    setup(null, { hasUpdates: true });
    await using screen = await render(<SidebarUpdatePill />);
    const button = screen.getByRole("button", { name: "Update everything" });
    await userEvent.click(button);
    await expect.element(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(document.activeElement).toBe(button.element()));
  });

  it.each([false, true])(
    "updates single entries from the table only behind its flag (%s)",
    async (enabled) => {
      const state = nightlyUpdate(RELEASE_NOTES);
      setup(state, { hasUpdates: true, appOnly: enabled });
      const downloadUpdate = vi.fn().mockResolvedValue({ accepted: true, completed: true, state });
      using _bridge = stubGlobal("desktopBridge", { downloadUpdate });
      await using screen = await render(<SidebarUpdatePill />);
      await userEvent.click(screen.getByRole("button", { name: /^Update everything/ }));
      await expect.element(page.getByRole("button", { name: "Cancel" })).toBeVisible();
      const server = page.getByRole("button", { name: "Update build-box" });
      if (!enabled) {
        await expect.element(server).not.toBeInTheDocument();
        return;
      }
      await userEvent.click(server);
      await vi.waitFor(() => expect(mocks.updateServer).toHaveBeenCalledWith(BUILD_BOX_SERVER));
      await userEvent.click(page.getByRole("button", { name: "Update Claude on build-box" }));
      await vi.waitFor(() =>
        expect(mocks.updateProvider).toHaveBeenCalledWith("env-box", "build-box", CLAUDE),
      );
      expect(downloadUpdate).not.toHaveBeenCalled();

      await userEvent.click(page.getByRole("button", { name: "Download this app's update" }));
      await vi.waitFor(() => expect(downloadUpdate).toHaveBeenCalledOnce());
      expect(mocks.runEverything).not.toHaveBeenCalled();
    },
  );

  it("restarts only this app from its row without a second confirmation", async () => {
    const state: DesktopUpdateState = {
      ...nightlyUpdate(RELEASE_NOTES),
      status: "downloaded",
      downloadedVersion: "0.0.50-nightly.2",
    };
    setup(state, { hasUpdates: true, appOnly: true });
    const installUpdate = vi.fn().mockResolvedValue({ accepted: true, completed: true, state });
    using _bridge = stubGlobal("desktopBridge", { installUpdate });
    await using screen = await render(<SidebarUpdatePill />);
    await userEvent.click(screen.getByRole("button", { name: /^Update everything/ }));
    await userEvent.click(page.getByRole("button", { name: "Restart this app to update" }));
    await vi.waitFor(() => expect(installUpdate).toHaveBeenCalledOnce());
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.runEverything).not.toHaveBeenCalled();
  });
});

describe("SidebarUpdatePill notes attention", () => {
  it("pops the notes once per version and keeps the dot until they are opened", async () => {
    setup(nightlyUpdate(RELEASE_NOTES), { hasUpdates: true, appOnly: true, popped: false });
    {
      await using _screen = await render(<SidebarUpdatePill />);
      const notes = page.getByRole("region", { name: "What's changed" });
      await expect.element(notes).toBeVisible();
      expect(badge()).not.toBeNull();

      await userEvent.click(document.body);
      await expect.element(notes).not.toBeInTheDocument();
      expect(badge()).not.toBeNull();
    }
    await using screen = await render(<SidebarUpdatePill />);
    await expect.element(screen.getByRole("button", { name: /\(new\)$/ })).toBeVisible();
    expect(document.querySelector('[aria-label="Update release notes"]')).toBeNull();

    await userEvent.tab();
    await expect.element(page.getByRole("region", { name: "What's changed" })).toBeVisible();
    await vi.waitFor(() => expect(badge()).toBeNull());
  });

  it("shows neither dot nor pop without the flag", async () => {
    setup(nightlyUpdate(RELEASE_NOTES), { hasUpdates: true, popped: false });
    await using screen = await render(<SidebarUpdatePill />);
    await expect.element(screen.getByRole("button", { name: "Update everything" })).toBeVisible();
    expect(badge()).toBeNull();
    expect(document.querySelector('[aria-label="Update release notes"]')).toBeNull();
  });
});

describe("Nexi failed update check", () => {
  it("retries the check even when providers have updates", async () => {
    const state: DesktopUpdateState = {
      ...nightlyUpdate([]),
      status: "error",
      feed: "nexi-ghe",
      errorContext: "check",
      issue: "unreachable",
      message: "Feed timed out.",
      nextCheckAt: "2026-11-02T13:45:00.000Z",
      availableVersion: null,
    };
    setup(state, { hasUpdates: true });
    const checkForUpdate = vi.fn().mockResolvedValue({ checked: false, state });
    const toast = vi.spyOn(toastManager, "add");
    using _bridge = stubGlobal("desktopBridge", { checkForUpdate });
    try {
      await using screen = await render(<SidebarUpdatePill />);
      const button = screen.getByRole("button", { name: /Could not check for updates/ });
      expect(button.element().getAttribute("aria-label")).toContain("Feed timed out.");
      expect(button.element().getAttribute("aria-label")).toContain("Click to try now.");
      await userEvent.click(button);
      await vi.waitFor(() => expect(checkForUpdate).toHaveBeenCalledOnce());
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
      expect(toast).not.toHaveBeenCalled();
    } finally {
      toast.mockRestore();
    }
  });
});
