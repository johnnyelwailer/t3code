import type { CloudSession } from "@t3tools/contracts";
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveEndedSessionAction } from "./t3team-endedSessionAction";

const environmentId = EnvironmentId.make("env-ws");

function session(overrides: Partial<CloudSession> & { sessionId: string }): CloudSession {
  return {
    providerKind: "github_actions",
    phase: "ready",
    detailsUrl: null,
    elapsedSeconds: 0,
    remainingSeconds: null,
    machineLabel: "ubuntu",
    failureReason: null,
    ...overrides,
  };
}

describe("resolveEndedSessionAction", () => {
  it("offers to start another session when nothing is on its way", () => {
    const sessions = [session({ sessionId: "1", phase: "stopped", environmentId: "env-ws" })];
    expect(resolveEndedSessionAction({ sessions, environmentId, createPending: false })).toEqual({
      kind: "start",
    });
  });

  it("waits while a create is in flight or a session is provisioning", () => {
    expect(resolveEndedSessionAction({ sessions: [], environmentId, createPending: true })).toEqual(
      {
        kind: "starting",
      },
    );
    const provisioning = [session({ sessionId: "2", phase: "preparing" })];
    expect(
      resolveEndedSessionAction({ sessions: provisioning, environmentId, createPending: false }),
    ).toEqual({ kind: "starting" });
  });

  it("offers to connect once a live session serves the same environment", () => {
    const live = session({ sessionId: "3", phase: "ready", environmentId: "env-ws" });
    expect(
      resolveEndedSessionAction({ sessions: [live], environmentId, createPending: false }),
    ).toEqual({ kind: "connect", session: live });
  });

  it("ignores a live session of another workspace", () => {
    const other = session({ sessionId: "4", phase: "ready", environmentId: "env-other" });
    expect(
      resolveEndedSessionAction({ sessions: [other], environmentId, createPending: false }).kind,
    ).toBe("start");
  });
});
