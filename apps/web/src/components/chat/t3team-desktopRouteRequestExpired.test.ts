import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { desktopRouteRequestExpired } from "./t3team-desktopRouteRequestExpired";

const env = EnvironmentId.make("env-cloud");
const session = (
  phase: CloudSession["phase"],
  environmentId: string = "env-cloud",
): Pick<CloudSession, "environmentId" | "phase"> =>
  ({ phase, environmentId }) as Pick<CloudSession, "environmentId" | "phase">;

const base = {
  isLocal: false,
  environmentId: env,
  sessions: [] as ReadonlyArray<Pick<CloudSession, "environmentId" | "phase">>,
};

describe("desktopRouteRequestExpired", () => {
  it("never expires a thread that already runs on this computer", () => {
    expect(
      desktopRouteRequestExpired({
        ...base,
        isLocal: true,
        liveState: "ended",
        sessions: [session("stopped")],
      }),
    ).toBe(false);
  });

  it("expires when the supervisor parked on an ended session, even with no session list", () => {
    expect(desktopRouteRequestExpired({ ...base, liveState: "ended" })).toBe(true);
  });

  it("expires when every session for this environment has ended", () => {
    expect(
      desktopRouteRequestExpired({
        ...base,
        sessions: [session("stopped"), session("failed")],
      }),
    ).toBe(true);
  });

  it("does not expire a missing session, a live one, or a temporary offline", () => {
    expect(desktopRouteRequestExpired(base)).toBe(false);
    expect(
      desktopRouteRequestExpired({
        ...base,
        sessions: [session("ready")],
      }),
    ).toBe(false);
    expect(
      desktopRouteRequestExpired({
        ...base,
        liveState: "offline",
        sessions: [session("ready")],
      }),
    ).toBe(false);
    // A later live session for the same environment is not ended.
    expect(
      desktopRouteRequestExpired({
        ...base,
        sessions: [session("stopped"), session("ready")],
      }),
    ).toBe(false);
    // A terminal session for a different environment does not expire this thread.
    expect(
      desktopRouteRequestExpired({
        ...base,
        sessions: [session("stopped", "env-other")],
      }),
    ).toBe(false);
  });
});
