import type { CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";
import { resolveCloudSetupSessionId } from "./t3team-cloudSetupSessionChoice";

function session(sessionId: string, phase: CloudSession["phase"]): CloudSession {
  return { sessionId, phase, environmentId: "env-cloud" } as CloudSession;
}

const sessions = [session("session-old", "stopped"), session("session-new", "ready")];

describe("resolveCloudSetupSessionId", () => {
  it("lets the Run-on pick beat a queued record parked on a session that is gone", () => {
    expect(
      resolveCloudSetupSessionId({
        queuedSessionId: "session-old",
        targetSessionId: "session-new",
        sessions,
      }),
    ).toBe("session-new");
  });

  it("keeps a queued record whose own session is still live", () => {
    expect(
      resolveCloudSetupSessionId({
        queuedSessionId: "session-new",
        targetSessionId: "session-old",
        sessions,
      }),
    ).toBe("session-new");
  });

  it("keeps the queued record while the pick is only a create in flight", () => {
    expect(
      resolveCloudSetupSessionId({
        queuedSessionId: "session-old",
        targetSessionId: CLOUD_SESSION_CREATING_ID,
        sessions,
      }),
    ).toBe("session-old");
  });

  it("falls back to whichever side exists", () => {
    expect(
      resolveCloudSetupSessionId({
        queuedSessionId: null,
        targetSessionId: "session-new",
        sessions,
      }),
    ).toBe("session-new");
    expect(
      resolveCloudSetupSessionId({
        queuedSessionId: "session-old",
        targetSessionId: null,
        sessions,
      }),
    ).toBe("session-old");
    expect(
      resolveCloudSetupSessionId({ queuedSessionId: null, targetSessionId: null, sessions }),
    ).toBeNull();
  });
});
