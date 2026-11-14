import type { DesktopUpdateState } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render, stubGlobal } from "../../../test/render";
import { SidebarProvider } from "../ui/sidebar";
import { SidebarChromeFooter } from "./SidebarChrome";
import { SidebarUpdatePill } from "./SidebarUpdatePill";

const mocks = vi.hoisted(() => ({ state: null as DesktopUpdateState | null }));
vi.mock("../../state/desktopUpdate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/desktopUpdate")>()),
  useDesktopUpdateState: () => mocks.state,
}));
vi.mock("../../env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../env")>()),
  isElectron: true,
}));
vi.mock("./useUpdateEverything", () => ({
  useUpdateEverything: () => ({
    hasUpdates: false,
    summary: "Update everything",
    version: null,
    providerCount: 0,
    rows: [],
    restarts: [],
  }),
  isHostedByThisApp: () => false,
}));

const GHE = "https://nexplore.ghe.com/hive/nx-nexi/pull";
const ready: DesktopUpdateState = {
  enabled: true,
  status: "downloaded",
  channel: "latest",
  currentVersion: "0.1.2-rc.7",
  hostArch: "x64",
  appArch: "x64",
  runningUnderArm64Translation: false,
  availableVersion: "0.1.2-rc.8",
  downloadedVersion: "0.1.2-rc.8",
  releaseNotes: [
    {
      version: "0.1.2-rc.8",
      totalItems: 3,
      items: [
        `fix(publish): do not bundle ffi-rs into the server tarball; a smoke step that shows its errors by @pj in ${GHE}/984`,
        `chore: pin vendor/t3code to fork main 898a0deca9 (Windows payload budget fix) by @pj in ${GHE}/986`,
        `fix(nexi-work): a phone cloud session starts behind an open draft, never ending in an error by @pj in ${GHE}/816`,
      ],
    },
  ],
  omittedReleaseCount: 0,
  downloadPercent: 100,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: true,
  feed: "nexi-ghe",
};
const failed: DesktopUpdateState = {
  ...ready,
  status: "error",
  downloadedVersion: null,
  availableVersion: null,
  releaseNotes: [],
  errorContext: "check",
  issue: "unreachable",
  message: "Feed timed out.",
};
const idle: DesktopUpdateState = { ...ready, status: "idle", downloadedVersion: null };

const DISMISSED_KEY = "nexi.update.dismissedVersion";
const NOTIFIED_KEY = "nexi.update.notifiedVersion";
const readyIcon = () => document.querySelector('[data-testid="nexi-update-ready-icon"]');
const popover = () => document.querySelector('[data-testid="nexi-update-popover"]');

async function withFreshStorage(version: string, body: () => Promise<void>) {
  const dismissed = localStorage.getItem(DISMISSED_KEY);
  const notified = localStorage.getItem(NOTIFIED_KEY);
  localStorage.removeItem(DISMISSED_KEY);
  localStorage.setItem(NOTIFIED_KEY, version);
  try {
    await body();
  } finally {
    if (dismissed === null) localStorage.removeItem(DISMISSED_KEY);
    else localStorage.setItem(DISMISSED_KEY, dismissed);
    if (notified === null) localStorage.removeItem(NOTIFIED_KEY);
    else localStorage.setItem(NOTIFIED_KEY, notified);
  }
}

describe("Nexi ready update in the footer", () => {
  it("shows a dot, opens plain notes on click, and installs the shown version", async () => {
    mocks.state = ready;
    const installUpdate = vi.fn().mockResolvedValue({ accepted: true });
    using _bridge = stubGlobal("desktopBridge", { installUpdate });
    await withFreshStorage("0.1.2-rc.8", async () => {
      await using screen = await render(<SidebarUpdatePill />);
      expect(readyIcon()?.getAttribute("data-pending")).toBe("true");
      expect(popover()).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: /0\.1\.2-rc\.8 is ready/ }));
      await expect.element(page.getByText("Nexi Work 0.1.2-rc.8 is ready")).toBeVisible();
      const text = popover()?.textContent ?? "";
      expect(text).toContain("A phone cloud session starts behind an open draft");
      expect(text).not.toContain("ffi-rs");
      expect(text).not.toMatch(/chore|pin vendor|@pj|https?:/);
      await userEvent.click(page.getByRole("button", { name: "Install now" }));
      await vi.waitFor(() => expect(installUpdate).toHaveBeenCalledWith("0.1.2-rc.8"));
    });
  });

  it("links the full history of the version and opens it outside the app", async () => {
    const releasePage = "https://nexplore.ghe.com/hive/nx-nexi/releases/tag/desktop-v0.1.2-rc.8";
    mocks.state = { ...ready, releaseUrl: releasePage };
    const openExternal = vi.fn().mockResolvedValue(true);
    using _bridge = stubGlobal("desktopBridge", { openExternal });
    await withFreshStorage("0.1.2-rc.8", async () => {
      await using screen = await render(<SidebarUpdatePill />);
      await userEvent.click(screen.getByRole("button", { name: /is ready to install/ }));
      await userEvent.click(page.getByRole("link", { name: "Full history" }));
      await vi.waitFor(() => expect(openExternal).toHaveBeenCalledWith(releasePage));
    });
  });

  it("shows no history link when the feed gave no release page", async () => {
    mocks.state = ready;
    await withFreshStorage("0.1.2-rc.8", async () => {
      await using screen = await render(<SidebarUpdatePill />);
      await userEvent.click(screen.getByRole("button", { name: /is ready to install/ }));
      await expect.element(page.getByText("Nexi Work 0.1.2-rc.8 is ready")).toBeVisible();
      expect(document.querySelector('[data-testid="nexi-update-popover"] a')).toBeNull();
    });
  });

  it("keeps Later per version: the dot goes, the icon stays, a new version brings it back", async () => {
    mocks.state = ready;
    await withFreshStorage("0.1.2-rc.8", async () => {
      {
        await using screen = await render(<SidebarUpdatePill />);
        await userEvent.click(screen.getByRole("button", { name: /is ready to install/ }));
        await userEvent.click(page.getByRole("button", { name: "Later" }));
        await vi.waitFor(() => expect(popover()).toBeNull());
        expect(readyIcon()?.getAttribute("data-pending")).toBe("false");
      }
      {
        await using _screen = await render(<SidebarUpdatePill />);
        expect(readyIcon()?.getAttribute("data-pending")).toBe("false");
      }
      mocks.state = { ...ready, downloadedVersion: "0.1.2-rc.9", availableVersion: "0.1.2-rc.9" };
      localStorage.setItem(NOTIFIED_KEY, "0.1.2-rc.9");
      {
        await using _screen = await render(<SidebarUpdatePill />);
        expect(readyIcon()?.getAttribute("data-pending")).toBe("true");
      }
    });
  });

  it("shows only the version when no note survives", async () => {
    mocks.state = { ...ready, releaseNotes: [] };
    await withFreshStorage("0.1.2-rc.8", async () => {
      await using screen = await render(<SidebarUpdatePill />);
      await userEvent.click(screen.getByRole("button", { name: /is ready to install/ }));
      await expect.element(page.getByText("Nexi Work 0.1.2-rc.8 is ready")).toBeVisible();
      expect(document.querySelector('[aria-label="Release notes"]')).toBeNull();
    });
  });

  it("puts nothing in the sidebar for a ready update", async () => {
    mocks.state = ready;
    await using _screen = await render(
      <SidebarProvider>
        <SidebarChromeFooter />
      </SidebarProvider>,
    );
    expect(readyIcon()).not.toBeNull();
    expect(document.querySelector('[data-testid="nexi-update-notice"]')).toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("keeps a failed check as the error icon, not the ready icon", async () => {
    mocks.state = failed;
    await using screen = await render(<SidebarUpdatePill />);
    expect(readyIcon()).toBeNull();
    expect(
      screen.getByRole("button", { name: /Could not check for updates/ }).element(),
    ).not.toBeNull();
  });

  it("shows no ready icon when there is no update", async () => {
    mocks.state = idle;
    await using _screen = await render(<SidebarUpdatePill />);
    expect(readyIcon()).toBeNull();
  });
});
