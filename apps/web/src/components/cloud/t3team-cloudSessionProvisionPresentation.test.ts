import type { CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  CLOUD_SESSION_PROVISION_PHASES,
  isCloudSessionProvisionPending,
  presentCloudSession,
} from "./t3team-cloudSessionProvisionPresentation";

const session = (overrides: Partial<CloudSession> = {}): CloudSession => ({
  sessionId: "s1",
  providerKind: "github_actions",
  phase: "preparing",
  elapsedSeconds: 60,
  remainingSeconds: null,
  machineLabel: "ubuntu-slim · 12 GB · 4 cores",
  failureReason: null,
  detailsUrl: null,
  ...overrides,
});

describe("presentCloudSession", () => {
  it("reads a user cancellation as 'Cancelled', not a provisioning failure", () => {
    const presentation = presentCloudSession(session({ phase: "cancelled" }));
    expect(presentation.title).toBe("Cancelled");
    expect(presentation.detail).toBe("Stopped by you.");
    expect(presentation.actionLabel).toBe("Start another");
    expect(presentation.tone).toBe("idle");
  });

  it("uses the real run duration when the server reports one", () => {
    const presentation = presentCloudSession(
      session({ phase: "stopped", elapsedSeconds: 99_999, durationSeconds: 4 * 3600 }),
    );
    // 4h of run time, not the session's 27h age.
    expect(presentation.detail).toBe("Ran for 4h 0m.");
  });

  it("falls back to the session's age when no duration is reported", () => {
    const presentation = presentCloudSession(
      session({ phase: "stopped", elapsedSeconds: 154, durationSeconds: undefined }),
    );
    expect(presentation.detail).toBe("Ran for 2m 34s.");
  });

  it("softens the 'starting' wording (no relay jargon)", () => {
    const presentation = presentCloudSession(session({ phase: "starting" }));
    expect(presentation.title).toBe("Almost there");
    expect(presentation.detail).toContain("Making it reachable");
    expect(presentation.detail).not.toContain("relay");
  });

  it("offers Connect as the primary and Stop as the secondary on a ready machine", () => {
    const presentation = presentCloudSession(session({ phase: "ready" }));
    expect(presentation.actionLabel).toBe("Connect");
    expect(presentation.secondaryActionLabel).toBe("Stop");
  });

  it("keeps 'Provisioning failed' with a reason sentence on a failure", () => {
    const presentation = presentCloudSession(
      session({ phase: "failed", failureReason: "The relay timed out." }),
    );
    expect(presentation.title).toBe("Provisioning failed");
    expect(presentation.detail).toBe("The relay timed out.");
    expect(presentation.actionLabel).toBe("Retry");
  });

  it("never offers a secondary action outside the ready phase", () => {
    for (const phase of CLOUD_SESSION_PROVISION_PHASES) {
      const presentation = presentCloudSession(session({ phase }));
      if (phase === "ready") continue;
      expect(presentation.secondaryActionLabel, phase).toBeNull();
    }
  });
});

describe("isCloudSessionProvisionPending", () => {
  it("treats only the not-yet-ready phases as pending", () => {
    for (const phase of ["requested", "queued", "preparing", "starting"] as const) {
      expect(isCloudSessionProvisionPending(phase)).toBe(true);
    }
    for (const phase of ["ready", "failed", "stopped", "cancelled"] as const) {
      expect(isCloudSessionProvisionPending(phase)).toBe(false);
    }
  });
});
