import { describe, expect, it } from "vite-plus/test";

import {
  ENVIRONMENT_LIVE_STATE_COPY,
  resolveEnvironmentLiveState,
  resolveLiveStateSidebarOverride,
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

describe("resolveLiveStateSidebarOverride", () => {
  it("leaves a live row alone", () => {
    expect(resolveLiveStateSidebarOverride("live")).toBeNull();
  });

  it("replaces the working word offline with last-seen wording's short form", () => {
    expect(resolveLiveStateSidebarOverride("offline")?.label).toBe(
      ENVIRONMENT_LIVE_STATE_COPY.offline.sidebar,
    );
  });

  it("calls an ended session ended, in a muted colour", () => {
    expect(resolveLiveStateSidebarOverride("ended")).toEqual({
      label: "Ended",
      className: "text-muted-foreground",
    });
  });
});
