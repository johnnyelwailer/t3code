import type { DesktopUpdateState } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { NexiUpdateNotice } from "./t3team-NexiUpdateNotice";

const mocks = vi.hoisted(() => ({ state: null as DesktopUpdateState | null }));
vi.mock("../../state/desktopUpdate", () => ({ useDesktopUpdateState: () => mocks.state }));
vi.mock("../../env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../env")>()),
  isElectron: true,
}));
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
  releaseNotes: [],
  omittedReleaseCount: 0,
  downloadPercent: 100,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: true,
  feed: "nexi-ghe",
};
const notice = () => document.querySelector('[data-testid="nexi-update-notice"]');

describe("Nexi ready notice", () => {
  it("persists Later across remounts and returns for a different downloaded version", async () => {
    const dismissed = localStorage.getItem("nexi.update.dismissedVersion");
    const notified = localStorage.getItem("nexi.update.notifiedVersion");
    localStorage.removeItem("nexi.update.dismissedVersion");
    localStorage.setItem("nexi.update.notifiedVersion", "0.1.2-rc.8");
    mocks.state = ready;
    try {
      {
        await using screen = await render(<NexiUpdateNotice />);
        expect(notice()).not.toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "Later" }));
        await vi.waitFor(() => expect(notice()).toBeNull());
      }
      {
        await using _screen = await render(<NexiUpdateNotice />);
        expect(notice()).toBeNull();
      }
      mocks.state = { ...ready, downloadedVersion: "0.1.2-rc.9", availableVersion: "0.1.2-rc.9" };
      localStorage.setItem("nexi.update.notifiedVersion", "0.1.2-rc.9");
      {
        await using screen = await render(<NexiUpdateNotice />);
        expect(notice()).not.toBeNull();
        expect(screen.getByRole("button", { name: "Later" }).element()).not.toBeNull();
      }
    } finally {
      if (dismissed === null) localStorage.removeItem("nexi.update.dismissedVersion");
      else localStorage.setItem("nexi.update.dismissedVersion", dismissed);
      if (notified === null) localStorage.removeItem("nexi.update.notifiedVersion");
      else localStorage.setItem("nexi.update.notifiedVersion", notified);
    }
  });
  it("does not render a card for a failed check", async () => {
    mocks.state = {
      ...ready,
      status: "error",
      downloadedVersion: null,
      errorContext: "check",
      issue: "unreachable",
    };
    await using _screen = await render(<NexiUpdateNotice />);
    expect(notice()).toBeNull();
  });
});
