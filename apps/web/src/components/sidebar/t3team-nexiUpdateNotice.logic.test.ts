import type { DesktopUpdateState } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { getAppUpdateNotesView, getNexiUpdateNoticeView } from "./t3team-nexiUpdateNotice.logic";

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
  ] as const)("has no ready view for %s", (status) => {
    expect(getNexiUpdateNoticeView({ ...base, status })).toBeNull();
  });
  it.each(["signed-out", "unreachable", "verification-failed", "unsupported"] as const)(
    "keeps %s failures out of the ready view",
    (issue) => {
      expect(
        getNexiUpdateNoticeView({ ...base, status: "error", issue, errorContext: "check" }),
      ).toBeNull();
    },
  );
  it("describes a downloaded update with plain notes", () => {
    const ready = {
      ...base,
      status: "downloaded" as const,
      downloadedVersion: "0.1.2-rc.8",
      releaseNotes: [
        {
          version: "0.1.2-rc.8",
          totalItems: 3,
          items: [
            "chore: pin vendor/t3code to fork main 898a0deca9 (Windows payload budget fix) by @pj in https://nexplore.ghe.com/hive/nx-nexi/pull/986",
            "fix(nexi-work): a phone cloud session starts behind an open draft, never ending in an error by @pj in https://nexplore.ghe.com/hive/nx-nexi/pull/816",
          ],
        },
      ],
    };
    expect(getNexiUpdateNoticeView(ready)).toEqual({
      version: "0.1.2-rc.8",
      title: "Nexi Work 0.1.2-rc.8 is ready",
      notes: ["A phone cloud session starts behind an open draft, never ending in an error"],
      actionLabel: "Install now",
      releaseUrl: null,
    });
  });
  it("links the release page of the downloaded version, but only over https", () => {
    const ready = { ...base, status: "downloaded" as const, downloadedVersion: "0.1.2-rc.8" };
    const page = "https://nexplore.ghe.com/hive/nx-nexi/releases/tag/desktop-v0.1.2-rc.8";
    expect(getNexiUpdateNoticeView({ ...ready, releaseUrl: page })?.releaseUrl).toBe(page);
    expect(getNexiUpdateNoticeView(ready)?.releaseUrl).toBeNull();
    for (const unsafe of ["javascript:alert(1)", "file:///C:/x", "not a url", ""]) {
      expect(getNexiUpdateNoticeView({ ...ready, releaseUrl: unsafe })?.releaseUrl).toBeNull();
    }
  });
  it("shows only the version when no note is left", () => {
    const ready = { ...base, status: "downloaded" as const, downloadedVersion: "0.1.2-rc.8" };
    expect(getNexiUpdateNoticeView(ready)?.notes).toEqual([]);
  });
  it("ignores other feeds and inconsistent ready states", () => {
    expect(getNexiUpdateNoticeView(null)).toBeNull();
    expect(getNexiUpdateNoticeView({ ...base, status: "downloaded" })).toBeNull();
    const { feed: _feed, ...otherFeed } = base;
    expect(
      getNexiUpdateNoticeView({
        ...otherFeed,
        status: "downloaded",
        downloadedVersion: "0.1.2-rc.8",
      }),
    ).toBeNull();
  });
});
describe("App update notes", () => {
  it("describes an update that is still to download", () => {
    const page = "https://nexplore.ghe.com/hive/nx-nexi/releases/tag/desktop-v0.1.2-rc.8";
    const available = {
      ...base,
      status: "available" as const,
      releaseUrl: page,
      releaseNotes: [
        {
          version: "0.1.2-rc.8",
          totalItems: 2,
          items: ["ci: shard the browser suite", "fix(web): faster sidebar by @pj"],
        },
      ],
    };
    expect(getAppUpdateNotesView(available)).toEqual({
      notes: ["Faster sidebar"],
      releaseUrl: page,
    });
  });
  it("has nothing to show without an update", () => {
    expect(getAppUpdateNotesView({ ...base, availableVersion: null })).toBeNull();
  });
});
