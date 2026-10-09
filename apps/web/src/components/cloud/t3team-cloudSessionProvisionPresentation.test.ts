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
    expect(presentation.detail).toBe("by you");
    expect(presentation.actionLabel).toBe("Start another");
    expect(presentation.tone).toBe("idle");
  });

  it("uses the real run duration when the server reports one", () => {
    const presentation = presentCloudSession(
      session({ phase: "stopped", elapsedSeconds: 99_999, durationSeconds: 4 * 3600 }),
    );
    // 4h of run time, not the session's 27h age.
    expect(presentation.detail).toBe("ran 4h 0m");
  });

  it("falls back to the session's age when no duration is reported", () => {
    const presentation = presentCloudSession(
      session({ phase: "stopped", elapsedSeconds: 154, durationSeconds: undefined }),
    );
    expect(presentation.detail).toBe("ran 2m 34s");
  });

  it("softens the 'starting' wording (no relay jargon)", () => {
    const presentation = presentCloudSession(session({ phase: "starting" }));
    expect(presentation.title).toBe("Connecting");
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
    expect(presentation.title).toBe("Failed");
    expect(presentation.detail).toBe("The relay timed out.");
    // A fresh session, not a replay of the failed one — the label says so.
    expect(presentation.actionLabel).toBe("Start another");
  });

  it("never offers a secondary action outside the ready phase", () => {
    for (const phase of CLOUD_SESSION_PROVISION_PHASES) {
      const presentation = presentCloudSession(session({ phase }));
      if (phase === "ready") continue;
      expect(presentation.secondaryActionLabel, phase).toBeNull();
    }
  });
});

describe("presentCloudSession for a project machine", () => {
  const preparing = (overrides: Partial<CloudSession>) =>
    presentCloudSession(session({ phase: "preparing", elapsedSeconds: 75, ...overrides }));

  it("names each machine milestone instead of building the workspace", () => {
    expect(preparing({ projectMachine: true, machineStage: "building" })).toMatchObject({
      title: "Building machine",
      detail: "1m 15s",
      tone: "working",
    });
    expect(preparing({ projectMachine: true, machineStage: "checking" }).title).toBe(
      "Checking machine",
    );
    expect(preparing({ projectMachine: true, machineStage: "installing" }).title).toBe(
      "Installing Nexi",
    );
    expect(preparing({ projectMachine: true }).title).toBe("Starting machine");
  });

  it("keeps the plain session's words", () => {
    expect(preparing({}).title).toBe("Building workspace");
  });

  it("says a setup session is checking the project out for an agent to write the machine", () => {
    expect(preparing({ machineSetup: true })).toMatchObject({
      title: "Checking out project",
    });
    expect(presentCloudSession(session({ phase: "ready", machineSetup: true })).detail).toBe(
      "describe your task",
    );
  });

  it("offers no plain session in place of an ended setup session", () => {
    for (const phase of ["failed", "stopped", "cancelled"] as const) {
      expect(presentCloudSession(session({ phase, machineSetup: true })).actionLabel).toBeNull();
      expect(presentCloudSession(session({ phase })).actionLabel).toBe("Start another");
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
