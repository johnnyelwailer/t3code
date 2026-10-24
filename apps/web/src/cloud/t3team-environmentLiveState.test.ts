import { describe, expect, it } from "vite-plus/test";

import {
  ENVIRONMENT_LIVE_STATE_COPY,
  resolveEnvironmentLiveState,
  resolveLiveStateTopStatus,
} from "./t3team-environmentLiveState";

describe("resolveEnvironmentLiveState", () => {
  it("is live while connected", () => {
    expect(
      resolveEnvironmentLiveState({ phase: "connected", sessionEnded: false, graceElapsed: false }),
    ).toBe("live");
  });

  it("rides out a short reconnect without rewriting the thread", () => {
    expect(
      resolveEnvironmentLiveState({
        phase: "reconnecting",
        sessionEnded: false,
        graceElapsed: false,
      }),
    ).toBe("live");
  });

  it("goes offline once the reconnect grace has run out", () => {
    for (const phase of ["connecting", "reconnecting"] as const) {
      expect(resolveEnvironmentLiveState({ phase, sessionEnded: false, graceElapsed: true })).toBe(
        "offline",
      );
    }
  });

  it("is offline at once when the connection failed or the device is offline", () => {
    for (const phase of ["error", "offline"] as const) {
      expect(resolveEnvironmentLiveState({ phase, sessionEnded: false, graceElapsed: false })).toBe(
        "offline",
      );
    }
  });

  it("is ended when the connection was parked on an ended session", () => {
    expect(
      resolveEnvironmentLiveState({ phase: "error", sessionEnded: true, graceElapsed: false }),
    ).toBe("ended");
  });

  it("resumes when the connection returns, even after an ended session was seen", () => {
    expect(
      resolveEnvironmentLiveState({ phase: "connected", sessionEnded: true, graceElapsed: true }),
    ).toBe("live");
  });
});

describe("resolveLiveStateTopStatus", () => {
  it("leaves a live row alone", () => {
    expect(resolveLiveStateTopStatus("live", "working")).toBeNull();
  });

  it("freezes a working row offline: no counter, last-seen wording", () => {
    const status = resolveLiveStateTopStatus("offline", "working");
    expect(status?.label).toBe(ENVIRONMENT_LIVE_STATE_COPY.offline.sidebar);
    expect(status?.title).toContain("last seen working");
  });

  it("only corrects working while offline", () => {
    for (const status of ["waiting", "approval", "input", "failed", null] as const) {
      expect(resolveLiveStateTopStatus("offline", status)).toBeNull();
    }
  });

  it("calls everything that waits on an ended session ended, and leaves history alone", () => {
    for (const status of ["working", "waiting", "approval", "input"] as const) {
      expect(resolveLiveStateTopStatus("ended", status)?.label).toBe("Ended");
    }
    expect(resolveLiveStateTopStatus("ended", "failed")).toBeNull();
    expect(resolveLiveStateTopStatus("ended", null)).toBeNull();
  });
});
