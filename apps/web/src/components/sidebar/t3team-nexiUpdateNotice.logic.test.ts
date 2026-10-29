import type { DesktopUpdateState } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { getNexiUpdateNoticeView } from "./t3team-nexiUpdateNotice.logic";

const base: DesktopUpdateState = {
  enabled: true,
  status: "idle",
  channel: "latest",
  currentVersion: "0.1.2-rc.4",
  hostArch: "arm64",
  appArch: "arm64",
  runningUnderArm64Translation: false,
  availableVersion: null,
  downloadedVersion: null,
  releaseNotes: [],
  omittedReleaseCount: 0,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: false,
  feed: "nexi-ghe",
};
const available: DesktopUpdateState = {
  ...base,
  status: "available",
  availableVersion: "0.1.2-rc.5",
  releaseNotes: [
    { version: "0.1.2-rc.5", items: ["fix: a", "feat: b", "c", "d", "e"], totalItems: 5 },
  ],
};

describe("getNexiUpdateNoticeView", () => {
  it("shows nothing off the Nexi feed, so upstream builds and nightlies keep only the sidebar pill", () => {
    const { feed: _feed, ...off } = available;
    expect(getNexiUpdateNoticeView({ ...off }, null)).toBeNull();
    expect(getNexiUpdateNoticeView(null, null)).toBeNull();
    expect(getNexiUpdateNoticeView({ ...base, status: "up-to-date" }, null)).toBeNull();
  });

  it("offers Install now with the release notes (the first few) for an available version", () => {
    expect(getNexiUpdateNoticeView(available, null)).toEqual({
      kind: "available",
      version: "0.1.2-rc.5",
      title: "Nexi Work 0.1.2-rc.5 is available",
      notes: ["fix: a", "feat: b", "c", "d"],
      action: "install-now",
      actionLabel: "Install now",
      dismissible: true,
    });
  });

  it("stays hidden after Later for that version, and returns for a newer one", () => {
    expect(getNexiUpdateNoticeView(available, "0.1.2-rc.5")).toBeNull();
    expect(
      getNexiUpdateNoticeView({ ...available, availableVersion: "0.1.2-rc.6" }, "0.1.2-rc.5")?.kind,
    ).toBe("available");
  });

  it("offers Restart now once downloaded, and shows progress while downloading", () => {
    const downloaded = getNexiUpdateNoticeView(
      { ...available, status: "downloaded", downloadedVersion: "0.1.2-rc.5" },
      null,
    );
    expect(downloaded).toMatchObject({
      kind: "downloaded",
      action: "restart-now",
      actionLabel: "Restart now",
    });
    expect(
      getNexiUpdateNoticeView(
        { ...available, status: "downloading", downloadPercent: 40 },
        "0.1.2-rc.5",
      ),
    ).toEqual({
      kind: "downloading",
      title: "Downloading 0.1.2-rc.5",
      percent: 40,
    });
  });

  it("says Sign in to GHE with a way to the settings, and never lets Later hide it", () => {
    const view = getNexiUpdateNoticeView(
      {
        ...base,
        status: "error",
        errorContext: "check",
        issue: "signed-out",
        message: "Sign in to GHE (nexplore.ghe.com) to get updates.",
      },
      "0.1.2-rc.5",
    );
    expect(view).toMatchObject({
      kind: "signed-out",
      title: "Sign in to GHE to get updates",
      action: "open-settings",
      dismissible: false,
      description: "Nexi Work reads its updates from GHE with your existing sign-in.",
    });
  });

  it("keeps the reason when GHE rejected the sign-in instead of repeating the title", () => {
    const view = getNexiUpdateNoticeView(
      { ...base, status: "error", errorContext: "check", issue: "signed-out", message: "GHE (nexplore.ghe.com) did not accept your sign-in for hive/nx-nexi (HTTP 401)." },
      null,
    );
    expect(view && "description" in view ? view.description : "").toContain("did not accept your sign-in");
  });

  it("shows a visible could-not-check state that promises a retry", () => {
    const view = getNexiUpdateNoticeView(
      {
        ...base,
        status: "error",
        errorContext: "check",
        issue: "unreachable",
        message: "Could not reach nexplore.ghe.com.",
      },
      null,
    );
    expect(view).toMatchObject({
      kind: "unreachable",
      title: "Could not check for updates",
      action: "retry",
    });
    expect(view && "description" in view ? view.description : "").toContain("will try again");
  });

  it("shows why a download was refused, with the update still on offer to try again", () => {
    const view = getNexiUpdateNoticeView(
      {
        ...available,
        errorContext: "download",
        issue: "verification-failed",
        message:
          "The downloaded update did not match its published checksum, so it was not installed.",
      },
      "0.1.2-rc.5",
    );
    expect(view).toMatchObject({
      kind: "verification-failed",
      title: "Update not installed",
      action: "retry",
    });
    expect(view && "description" in view ? view.description : "").toMatch(
      /did not match its published checksum/u,
    );
  });

  it("has nothing to say about an unsupported machine", () => {
    expect(
      getNexiUpdateNoticeView(
        { ...base, status: "error", errorContext: "check", issue: "unsupported", message: "x" },
        null,
      ),
    ).toBeNull();
  });
});
