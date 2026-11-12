import { describe, expect, it } from "vite-plus/test";

import {
  resolveCloudSessionVisibleStatus,
  type CloudSessionVisibleFacts,
} from "./t3team-cloudSessionVisibleStatus";
import { tlcTraces } from "./t3team-cloudSessionVisibleStatus.fixtures";

const idle: CloudSessionVisibleFacts = {
  phase: "none",
  endedSticky: false,
  startingAnother: false,
  queued: "none",
  failureKind: "none",
  machineConnected: false,
  projectReady: false,
  providerReady: false,
  cloneSuggested: false,
  conn: "live",
};

function facts(p: Partial<CloudSessionVisibleFacts>): CloudSessionVisibleFacts {
  return { ...idle, ...p };
}

describe("resolveCloudSessionVisibleStatus", () => {
  it("is silent when the thread is idle", () => {
    const s = resolveCloudSessionVisibleStatus(idle);
    expect(s.kind).toBe("none");
    expect(s.visible).toEqual([]);
    expect(s.primary).toBe("none");
  });

  it("shows only the setup card while a session is starting (08:27 states 2–7)", () => {
    const s = resolveCloudSessionVisibleStatus(
      facts({ phase: "starting", queued: "waiting", startingAnother: true }),
    );
    expect(s.kind).toBe("setting_up");
    expect(s.setupStage).toBe("working");
    expect(s.visible).toEqual(["setup"]);
    expect(s.showEndedBanner).toBe(false);
    expect(s.showCloneBanner).toBe(false);
    expect(s.showOfflineBanner).toBe(false);
    expect(s.showQueuedBindBanner).toBe(false);
    expect(s.primary).toBe("none");
  });

  it("08:27 ended + still-setting-up: only the failed setup card, Try again (not the ended banner)", () => {
    const last = tlcTraces["phil-0827"].at(-1)!;
    const s = resolveCloudSessionVisibleStatus(last.facts);
    expect(last.current.visible.sort()).toEqual(["ended", "setup"]);
    expect(s.setupStage).toBe("failed");
    expect(s.visible).toEqual(["setup"]);
    expect(s.visible).toEqual(last.fixed.visible);
    expect(s.showEndedBanner).toBe(false);
    expect(s.primary).toBe("try_again");
  });

  it("08:32 ended + setting up + Add to machine: only the working setup card, no banners", () => {
    const last = tlcTraces["phil-0832"].at(-1)!;
    const s = resolveCloudSessionVisibleStatus(last.facts);
    expect(last.current.visible.sort()).toEqual(["clone", "ended", "setup"]);
    expect(s.setupStage).toBe("working");
    expect(s.visible).toEqual(["setup"]);
    expect(s.visible).toEqual(last.fixed.visible);
    expect(s.showCloneBanner).toBe(false);
    expect(s.showEndedBanner).toBe(false);
    expect(s.primary).toBe("none");
  });

  it("hides the ended banner while starting another session (Try again in flight)", () => {
    const s = resolveCloudSessionVisibleStatus(
      facts({
        phase: "creating",
        queued: "waiting",
        endedSticky: true,
        startingAnother: true,
      }),
    );
    expect(s.visible).toEqual(["setup"]);
    expect(s.setupStage).toBe("working");
    expect(s.showEndedBanner).toBe(false);
  });

  it("shows only the ended banner when the session has ended and nothing is queued", () => {
    const s = resolveCloudSessionVisibleStatus(
      facts({ phase: "stopped", endedSticky: true, conn: "blocked" }),
    );
    expect(s.kind).toBe("ended");
    expect(s.visible).toEqual(["ended"]);
    expect(s.showSetupCard).toBe(false);
    expect(s.primary).toBe("start_another");
  });

  it("shows only the offline banner when the machine is offline and nothing is starting", () => {
    const s = resolveCloudSessionVisibleStatus(facts({ phase: "ready", conn: "offline" }));
    expect(s.kind).toBe("offline");
    expect(s.visible).toEqual(["offline"]);
    expect(s.primary).toBe("reconnect");
  });

  it("does not show the offline banner while a session is starting", () => {
    const s = resolveCloudSessionVisibleStatus(
      facts({ phase: "preparing", queued: "waiting", startingAnother: true, conn: "offline" }),
    );
    expect(s.visible).toEqual(["setup"]);
    expect(s.showOfflineBanner).toBe(false);
  });

  it("offers Retry (not Try again) when a queued send failed and the session is still ready", () => {
    const s = resolveCloudSessionVisibleStatus(
      facts({
        phase: "ready",
        queued: "failed",
        failureKind: "project_not_resolved",
        machineConnected: true,
      }),
    );
    expect(s.setupStage).toBe("failed");
    expect(s.visible).toEqual(["setup"]);
    expect(s.primary).toBe("retry");
  });

  it("a second click (startingAnother already true) still shows one status", () => {
    const s = resolveCloudSessionVisibleStatus(
      facts({
        phase: "creating",
        queued: "waiting",
        endedSticky: true,
        startingAnother: true,
        conn: "blocked",
      }),
    );
    expect(s.visible).toEqual(["setup"]);
  });

  it("cancel: after the user cancels a queued send, the thread is silent", () => {
    const s = resolveCloudSessionVisibleStatus(
      facts({ phase: "ready", queued: "none", machineConnected: true, projectReady: true }),
    );
    expect(s.kind).toBe("none");
    expect(s.visible).toEqual([]);
  });

  it("app restart with a queued message parked as a retryable failure: only the failed card", () => {
    // AppRestart in the spec: creating + waiting → phase none, queued failed.
    const s = resolveCloudSessionVisibleStatus(
      facts({ phase: "none", queued: "failed", failureKind: "other" }),
    );
    expect(s.setupStage).toBe("failed");
    expect(s.visible).toEqual(["setup"]);
    expect(s.primary).toBe("retry");
  });

  it("sign-out mid-start: the setup card stays the one status (phase is unchanged)", () => {
    const s = resolveCloudSessionVisibleStatus(
      facts({ phase: "creating", queued: "waiting", startingAnother: true }),
    );
    expect(s.visible).toEqual(["setup"]);
    expect(s.setupStage).toBe("working");
  });

  it("duplicate sends: a sending record still shows only the working card", () => {
    const s = resolveCloudSessionVisibleStatus(
      facts({
        phase: "ready",
        queued: "sending",
        machineConnected: true,
        projectReady: true,
        providerReady: true,
      }),
    );
    expect(s.visible).toEqual(["setup"]);
    expect(s.setupStage).toBe("working");
    expect(s.primary).toBe("none");
  });

  it("never raises a clone banner, even when the current code would (08:32)", () => {
    const s = resolveCloudSessionVisibleStatus(
      facts({
        phase: "ready",
        queued: "waiting",
        endedSticky: true,
        startingAnother: true,
        machineConnected: true,
        cloneSuggested: true,
        conn: "blocked",
      }),
    );
    expect(s.showCloneBanner).toBe(false);
    expect(s.visible).toEqual(["setup"]);
  });
});
