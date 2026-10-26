import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  isCloudSessionEnvironment,
  liveCloudSessionForEnvironment,
  savedEnvironmentForCloudSession,
} from "./t3team-cloudSessionEnvironmentMatch";

const ENV = EnvironmentId.make("env-cloud-1");

function session(
  sessionId: string,
  phase: CloudSession["phase"],
  environmentId?: string,
): CloudSession {
  return {
    sessionId,
    providerKind: "github_actions",
    phase,
    elapsedSeconds: 0,
    remainingSeconds: null,
    machineLabel: "machine",
    failureReason: null,
    detailsUrl: null,
    ...(environmentId === undefined ? {} : { environmentId }),
  };
}

describe("savedEnvironmentForCloudSession", () => {
  const saved = [{ environmentId: ENV, label: "nx-nexi" }];

  it("finds the saved machine a ready session is pinned to", () => {
    expect(savedEnvironmentForCloudSession(session("s1", "ready", String(ENV)), saved)?.label).toBe(
      "nx-nexi",
    );
  });

  it("offers nothing to forget without a pinned id, an unsaved machine, or an ended session", () => {
    expect(savedEnvironmentForCloudSession(session("s1", "ready"), saved)).toBeNull();
    expect(
      savedEnvironmentForCloudSession(session("s1", "ready", "env-unsaved"), saved),
    ).toBeNull();
    expect(
      savedEnvironmentForCloudSession(session("s1", "stopped", String(ENV)), saved),
    ).toBeNull();
  });
});

describe("liveCloudSessionForEnvironment", () => {
  it("matches a saved machine from the server-pinned id alone — survives a reload", () => {
    // Only the server's record, no connect in this tab: exactly the state after a reload.
    const sessions = [session("s1", "ready", String(ENV))];
    expect(liveCloudSessionForEnvironment(sessions, ENV)?.sessionId).toBe("s1");
    expect(liveCloudSessionForEnvironment(sessions, EnvironmentId.make("env-other"))).toBeNull();
  });

  it("matches nothing when the record carries no environment id", () => {
    expect(liveCloudSessionForEnvironment([session("s1", "ready")], ENV)).toBeNull();
  });

  it("does not match a session that has already ended", () => {
    expect(liveCloudSessionForEnvironment([session("s1", "stopped", String(ENV))], ENV)).toBeNull();
  });
});

describe("isCloudSessionEnvironment", () => {
  it("is true for a broker-transported machine, even before the session list has loaded", () => {
    expect(
      isCloudSessionEnvironment({
        target: { _tag: "BrokerConnectionTarget" },
        environmentId: ENV,
        sessions: [],
      }),
    ).toBe(true);
  });

  it("is true for a relay machine a live cloud session is pinned to", () => {
    const sessions = [session("s1", "ready", String(ENV))];
    expect(
      isCloudSessionEnvironment({
        target: { _tag: "RelayConnectionTarget" },
        environmentId: ENV,
        sessions,
      }),
    ).toBe(true);
  });

  it("stays true after the session ended: its server is still not the user's to relaunch", () => {
    const ended = [session("s1", "stopped", String(ENV))];
    expect(
      isCloudSessionEnvironment({
        target: { _tag: "RelayConnectionTarget" },
        environmentId: ENV,
        sessions: ended,
      }),
    ).toBe(true);
  });

  it("is false for the user's own machines and for relay machines no session is pinned to", () => {
    const other = [session("s1", "ready", "env-other")];
    expect(
      isCloudSessionEnvironment({
        target: { _tag: "PrimaryConnectionTarget" },
        environmentId: ENV,
        sessions: [],
      }),
    ).toBe(false);
    expect(
      isCloudSessionEnvironment({
        target: { _tag: "RelayConnectionTarget" },
        environmentId: ENV,
        sessions: other,
      }),
    ).toBe(false);
    expect(isCloudSessionEnvironment({ target: null, environmentId: ENV, sessions: [] })).toBe(
      false,
    );
  });
});
