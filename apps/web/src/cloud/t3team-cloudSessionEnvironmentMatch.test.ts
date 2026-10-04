import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
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
