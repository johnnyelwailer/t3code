import type { DesktopUpdateState } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { getNexiUpdateNoticeView } from "./t3team-nexiUpdateNotice.logic";

const base: DesktopUpdateState = {
  enabled: true,
  status: "idle",
  channel: "latest",
  currentVersion: "0.1.2-rc.7",
  hostArch: "x64",
  appArch: "x64",
  runningUnderArm64Translation: false,
  availableVersion: "0.1.2-rc.8",
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
describe("Nexi update notice", () => {
  it.each([
    "idle",
    "checking",
    "available",
    "downloading",
    "error",
    "up-to-date",
    "disabled",
  ] as const)("has no card for %s", (status) => {
    expect(getNexiUpdateNoticeView({ ...base, status }, null)).toBeNull();
  });
  it.each(["signed-out", "unreachable", "verification-failed", "unsupported"] as const)(
    "keeps %s failures out of the sidebar card",
    (issue) => {
      expect(
        getNexiUpdateNoticeView({ ...base, status: "error", issue, errorContext: "check" }, null),
      ).toBeNull();
    },
  );
  it("shows a dismissible ready notice and hides that version across remounts", () => {
    const ready = { ...base, status: "downloaded" as const, downloadedVersion: "0.1.2-rc.8" };
    expect(getNexiUpdateNoticeView(ready, null)).toMatchObject({
      kind: "downloaded",
      version: "0.1.2-rc.8",
      action: "restart-now",
      dismissible: true,
    });
    expect(getNexiUpdateNoticeView(ready, "0.1.2-rc.8")).toBeNull();
    expect(
      getNexiUpdateNoticeView({ ...ready, downloadedVersion: "0.1.2-rc.9" }, "0.1.2-rc.8"),
    ).not.toBeNull();
  });
  it("ignores other feeds and inconsistent ready states", () => {
    expect(getNexiUpdateNoticeView(null, null)).toBeNull();
    expect(getNexiUpdateNoticeView({ ...base, status: "downloaded" }, null)).toBeNull();
    const { feed: _feed, ...otherFeed } = base;
    expect(
      getNexiUpdateNoticeView(
        { ...otherFeed, status: "downloaded", downloadedVersion: "0.1.2-rc.8" },
        null,
      ),
    ).toBeNull();
  });
});
