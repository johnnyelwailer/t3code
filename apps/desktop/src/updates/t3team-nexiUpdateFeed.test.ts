import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import { describeNexiUpdateFailure } from "./t3team-nexiUpdateFeed.ts";
import { isLiveFlavorPreset } from "./t3team-nexiUpdateFlavor.ts";
import { NexiUpdateIssue } from "./t3team-nexiUpdateProvider.ts";
import { updatePollDelay, withUpdateIssue } from "./t3team-updateIssue.ts";
import { createInitialDesktopUpdateState } from "./updateMachine.ts";

const runtime = {
  hostArch: "arm64",
  appArch: "arm64",
  runningUnderArm64Translation: false,
} as const;
const base = createInitialDesktopUpdateState("0.1.2-rc.4", runtime, "latest");

describe("describeNexiUpdateFailure", () => {
  it("names the issues the provider raises, also when electron-updater wraps them", () => {
    expect(describeNexiUpdateFailure(new NexiUpdateIssue("signed-out", "Sign in to GHE."))).toEqual(
      Option.some({ issue: "signed-out", message: "Sign in to GHE." }),
    );
    expect(
      describeNexiUpdateFailure(
        Object.assign(new Error("wrapped"), { cause: new NexiUpdateIssue("unreachable", "down") }),
      ),
    ).toEqual(Option.some({ issue: "unreachable", message: "down" }));
  });

  it("calls a checksum mismatch a verification failure that says why nothing was installed", () => {
    const failure = describeNexiUpdateFailure(
      Object.assign(new Error("sha512 checksum mismatch, expected AAA, got BBB"), {
        code: "ERR_CHECKSUM_MISMATCH",
      }),
    );
    expect(Option.getOrThrow(failure).issue).toBe("verification-failed");
    expect(Option.getOrThrow(failure).message).toMatch(
      /did not match its published checksum, so it was not installed/u,
    );
    expect(Option.getOrThrow(failure).message).not.toContain("AAA");
  });

  it("leaves every other error to the ordinary path", () => {
    expect(Option.isNone(describeNexiUpdateFailure(new Error("boom")))).toBe(true);
    expect(Option.isNone(describeNexiUpdateFailure("text"))).toBe(true);
    expect(Option.isNone(describeNexiUpdateFailure(null))).toBe(true);
  });
});

describe("withUpdateIssue", () => {
  it("shows the issue only while the state is an error, and never lets it outlive one", () => {
    const failed = { ...base, status: "error", errorContext: "check" } as const;
    expect(withUpdateIssue(failed, "signed-out", false).issue).toBe("signed-out");
    expect(
      withUpdateIssue({ ...base, status: "checking" }, "signed-out", false),
    ).not.toHaveProperty("issue");
    expect(withUpdateIssue({ ...failed, issue: "signed-out" }, null, false)).not.toHaveProperty(
      "issue",
    );
    expect(
      withUpdateIssue({ ...base, status: "up-to-date", issue: "signed-out" }, "signed-out", false),
    ).not.toHaveProperty("issue");
    expect(withUpdateIssue(base, null, true).feed).toBe("nexi-ghe");
    expect(withUpdateIssue(base, null, false)).not.toHaveProperty("feed");
  });
});

describe("isLiveFlavorPreset", () => {
  it("is true only for the live flavor's preset: nightlies and upstream builds never use the feed", () => {
    expect(isLiveFlavorPreset('{"flavor":"live","flags":{}}')).toBe(true);
    expect(isLiveFlavorPreset('{"flavor":"nightly","flags":{}}')).toBe(false);
    expect(isLiveFlavorPreset("nonsense")).toBe(false);
    expect(isLiveFlavorPreset(undefined)).toBe(false);
  });
});

describe("updatePollDelay", () => {
  it("keeps upstream's cadence off the feed, polls GHE every few hours, and retries an unreachable GHE sooner", () => {
    expect(updatePollDelay(false, "unreachable")).toBe("4 minutes");
    expect(updatePollDelay(true, null)).toBe("3 hours");
    expect(updatePollDelay(true, "signed-out")).toBe("3 hours");
    expect(updatePollDelay(true, "unreachable")).toBe("15 minutes");
  });
});
