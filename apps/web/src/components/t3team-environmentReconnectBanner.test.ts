import { describe, expect, it } from "vitest";

import { ENVIRONMENT_RECONNECT_WARNING_GRACE_MS } from "./ChatView.logic";
import {
  LOCAL_ENVIRONMENT_RECONNECT_NOTICE_GRACE_MS,
  environmentReconnectGraceMs,
  resolveEnvironmentUnavailableBannerCopy,
} from "./t3team-environmentReconnectBanner";

describe("environmentReconnectGraceMs", () => {
  it("waits much longer before mentioning a local backend restart", () => {
    expect(environmentReconnectGraceMs(true)).toBe(LOCAL_ENVIRONMENT_RECONNECT_NOTICE_GRACE_MS);
    expect(environmentReconnectGraceMs(false)).toBe(ENVIRONMENT_RECONNECT_WARNING_GRACE_MS);
    expect(LOCAL_ENVIRONMENT_RECONNECT_NOTICE_GRACE_MS).toBeGreaterThan(
      ENVIRONMENT_RECONNECT_WARNING_GRACE_MS,
    );
  });
});

describe("resolveEnvironmentUnavailableBannerCopy", () => {
  it("never calls the local machine 'reconnecting'", () => {
    for (const phase of ["connecting", "reconnecting"] as const) {
      const copy = resolveEnvironmentUnavailableBannerCopy({
        label: "NX-GM17GBWE",
        phase,
        isLocal: true,
      });
      expect(copy.title).toBe("Local server is restarting…");
      expect(copy.title).not.toContain("NX-GM17GBWE");
      expect(copy.variant).toBe("default");
      expect(copy.quiet).toBe(true);
      expect(copy.showReconnect).toBe(false);
    }
  });

  it("escalates a local backend only when it has actually failed", () => {
    expect(
      resolveEnvironmentUnavailableBannerCopy({ label: "PC", phase: "error", isLocal: true }),
    ).toEqual({
      variant: "error",
      title: "Local server isn't responding",
      showReconnect: true,
      quiet: false,
    });
  });

  it("keeps the remote wording unchanged", () => {
    expect(
      resolveEnvironmentUnavailableBannerCopy({
        label: "Build box",
        phase: "reconnecting",
        isLocal: false,
      }),
    ).toEqual({
      variant: "warning",
      title: "Build box is reconnecting",
      showReconnect: false,
      quiet: false,
    });
    expect(
      resolveEnvironmentUnavailableBannerCopy({
        label: "Build box",
        phase: "error",
        isLocal: false,
      }),
    ).toMatchObject({ variant: "error", title: "Build box is offline", showReconnect: true });
  });
});
