import type { DesktopUpdateState } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { formatLastChecked, getNexiAboutStatus } from "./t3team-nexiAboutStatus.logic";

const base: DesktopUpdateState = {
  enabled: true,
  status: "idle",
  channel: "latest",
  currentVersion: "0.1.2-rc.6",
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
const label = (patch: Partial<DesktopUpdateState>) =>
  getNexiAboutStatus({ ...base, ...patch })?.label;

describe("getNexiAboutStatus", () => {
  it("is null off the GHE feed and while updates are disabled, so upstream's own text stands", () => {
    const { feed: _feed, ...off } = base;
    expect(getNexiAboutStatus({ ...off })).toBeNull();
    expect(getNexiAboutStatus(null)).toBeNull();
    expect(getNexiAboutStatus({ ...base, enabled: false })).toBeNull();
    expect(getNexiAboutStatus({ ...base, status: "disabled" })).toBeNull();
  });

  it("says Up to date only after a check that finished, never before one and never after a problem", () => {
    expect(label({ status: "up-to-date", checkedAt: "2026-10-30T08:00:00Z" })).toBe("Up to date");
    expect(label({ status: "up-to-date", checkedAt: null })).toBe("Not checked yet");
    expect(label({ status: "idle" })).toBe("Not checked yet");
    for (const issue of ["signed-out", "unreachable", "verification-failed"] as const) {
      expect(
        label({ status: "error", errorContext: "check", issue, checkedAt: "2026-10-30T08:00:00Z" }),
      ).not.toBe("Up to date");
    }
  });

  it("has its own words and action for every state", () => {
    expect(getNexiAboutStatus({ ...base, status: "checking" })).toMatchObject({
      label: "Checking GHE…",
      action: null,
    });
    expect(
      getNexiAboutStatus({ ...base, status: "available", availableVersion: "0.1.2-rc.7" }),
    ).toMatchObject({
      label: "Update available: 0.1.2-rc.7",
      action: { kind: "install-now", label: "Install now" },
    });
    expect(
      getNexiAboutStatus({
        ...base,
        status: "downloading",
        availableVersion: "0.1.2-rc.7",
        downloadPercent: 41.6,
      }),
    ).toMatchObject({ label: "Downloading 0.1.2-rc.7", detail: "42%", action: null });
    expect(
      getNexiAboutStatus({ ...base, status: "downloaded", downloadedVersion: "0.1.2-rc.7" }),
    ).toMatchObject({ label: "Ready to install 0.1.2-rc.7", action: { kind: "restart-now" } });
    expect(
      getNexiAboutStatus({ ...base, status: "error", errorContext: "check", issue: "signed-out" }),
    ).toMatchObject({
      label: "Signed out of GHE",
      action: { kind: "open-sign-in", label: "Sign in to GHE" },
    });
    expect(
      getNexiAboutStatus({ ...base, status: "error", errorContext: "check", issue: "unreachable" }),
    ).toMatchObject({ label: "Could not reach GHE", action: { kind: "retry" } });
    expect(
      getNexiAboutStatus({
        ...base,
        status: "available",
        availableVersion: "0.1.2-rc.7",
        errorContext: "download",
        issue: "verification-failed",
        message:
          "The downloaded update did not match its published checksum, so it was not installed.",
      }),
    ).toMatchObject({
      label: "Update not installed",
      action: { kind: "install-now", label: "Download again" },
    });
    expect(
      getNexiAboutStatus({ ...base, status: "error", errorContext: "check", message: "boom" }),
    ).toMatchObject({ label: "Update check failed", detail: "boom" });
  });
});

describe("formatLastChecked", () => {
  const now = new Date("2026-10-30T09:00:00Z");
  it("reads as a time since the check, then as a UTC time, and as nothing without a check", () => {
    expect(formatLastChecked(null, now)).toBeNull();
    expect(formatLastChecked("nonsense", now)).toBeNull();
    expect(formatLastChecked("2026-10-30T08:59:40Z", now)).toBe("just now");
    expect(formatLastChecked("2026-10-30T08:55:00Z", now)).toBe("5 min ago");
    expect(formatLastChecked("2026-10-30T06:00:00Z", now)).toBe("3 h ago");
    expect(formatLastChecked("2026-10-28T06:30:12Z", now)).toBe("2026-10-28 06:30 UTC");
  });
});
