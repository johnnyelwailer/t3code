import { describe, expect, it } from "vite-plus/test";
import type { DesktopUpdateState } from "@t3tools/contracts";

import {
  getDesktopUpdateIdleTooltip,
  canCheckForUpdate,
  getDesktopUpdateButtonTooltip,
  getDesktopUpdateReleaseHistoryUrl,
  getDesktopUpdateReleaseUrl,
  resolveDesktopUpdateButtonAction,
} from "./desktopUpdate.logic";

const baseState: DesktopUpdateState = {
  enabled: true,
  status: "idle",
  channel: "latest",
  currentVersion: "1.0.0",
  hostArch: "x64",
  appArch: "x64",
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
};

describe("desktop update button state", () => {
  it("keeps retry action available after a download error", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "error",
      availableVersion: "1.1.0",
      message: "network timeout",
      errorContext: "download",
      canRetry: true,
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("download");
    expect(getDesktopUpdateButtonTooltip(state)).toContain("Click to retry");
  });

  it("prefers a newly available release over a stale downloaded version", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "available",
      availableVersion: "1.2.0",
      downloadedVersion: "1.1.0",
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("download");
  });

  it("hides the install action while checking for a newer release", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "checking",
      availableVersion: "1.1.0",
      downloadedVersion: "1.1.0",
      downloadPercent: 100,
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("none");
  });
});

describe("desktop update UI helpers", () => {
  it.each(["owner/repo/extra", "owner#notes/repo", "owner/repo?tab=notes"])(
    "falls back to upstream for an invalid configured repository: %s",
    (repository) => {
      expect(getDesktopUpdateReleaseHistoryUrl(repository)).toBe(
        "https://github.com/pingdotgg/t3code/releases",
      );
      expect(getDesktopUpdateReleaseUrl("1.2.3", repository)).toBe(
        "https://github.com/pingdotgg/t3code/releases/tag/v1.2.3",
      );
    },
  );

  it("keeps the upstream defaults when nothing is configured", () => {
    expect(getDesktopUpdateReleaseHistoryUrl()).toBe(
      "https://github.com/pingdotgg/t3code/releases",
    );
    expect(getDesktopUpdateReleaseUrl("1.2.3")).toBe(
      "https://github.com/pingdotgg/t3code/releases/tag/v1.2.3",
    );
  });

  it("builds the release link for a self-hosted host with a custom tag prefix", () => {
    expect(
      getDesktopUpdateReleaseUrl("0.1.2-rc.11", "hive/nx-nexi", "nexplore.ghe.com", "desktop-v"),
    ).toBe("https://nexplore.ghe.com/hive/nx-nexi/releases/tag/desktop-v0.1.2-rc.11");
    expect(getDesktopUpdateReleaseHistoryUrl("hive/nx-nexi", "nexplore.ghe.com")).toBe(
      "https://nexplore.ghe.com/hive/nx-nexi/releases",
    );
  });

  it.each(["https://github.com", "github.com:80/", " "])(
    "falls back to the default host for an invalid one: %s",
    (host) => {
      expect(getDesktopUpdateReleaseHistoryUrl("hive/nx-nexi", host)).toBe(
        "https://github.com/hive/nx-nexi/releases",
      );
    },
  );

  it("falls back to the default tag prefix when it is empty or holds URL characters", () => {
    expect(getDesktopUpdateReleaseUrl("1.2.3", "hive/nx-nexi", "nexplore.ghe.com", "")).toBe(
      "https://nexplore.ghe.com/hive/nx-nexi/releases/tag/v1.2.3",
    );
    expect(getDesktopUpdateReleaseUrl("1.2.3", "hive/nx-nexi", "nexplore.ghe.com", "tag/v")).toBe(
      "https://nexplore.ghe.com/hive/nx-nexi/releases/tag/v1.2.3",
    );
  });
});

describe("canCheckForUpdate", () => {
  it("returns true once an update has been downloaded so newer releases can be found", () => {
    expect(
      canCheckForUpdate({
        ...baseState,
        status: "downloaded",
        availableVersion: "1.1.0",
        downloadedVersion: "1.1.0",
      }),
    ).toBe(true);
  });
});

describe("Nexi failed-check tooltip", () => {
  it("keeps the failure and the scheduler's time with a retry instruction", () => {
    const nextCheckAt = "2026-11-02T13:45:00.000Z";
    const tooltip = getDesktopUpdateIdleTooltip({
      ...baseState,
      status: "error",
      feed: "nexi-ghe",
      errorContext: "check",
      message: "Feed timed out.",
      nextCheckAt,
    });
    expect(tooltip.title).toBe("Could not check for updates");
    expect(tooltip.detail).toContain("Feed timed out.");
    expect(tooltip.detail).toContain(new Date(nextCheckAt).toLocaleString());
    expect(tooltip.detail).toContain("Click to try now.");
  });
  it("does not invent a deadline when one is absent", () => {
    const tooltip = getDesktopUpdateIdleTooltip({
      ...baseState,
      status: "error",
      feed: "nexi-ghe",
      errorContext: "check",
    });
    expect(tooltip.detail).toContain("being scheduled");
    expect(getDesktopUpdateIdleTooltip(baseState).title).toBe("Check for updates");
  });
});
