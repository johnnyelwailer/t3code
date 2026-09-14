import type { CloudSession, CloudSessionPhase } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  CLOUD_SESSION_HISTORY_LIMIT,
  isTerminalCloudSessionPhase,
  mergeLocalCloudSession,
  runOnCloudSessions,
  splitCloudSessions,
} from "./t3team-cloudSessionSplit";

function session(sessionId: string, phase: CloudSessionPhase): CloudSession {
  return {
    sessionId,
    providerKind: "github_actions",
    phase,
    elapsedSeconds: 0,
    remainingSeconds: null,
    machineLabel: "machine",
    failureReason: null,
    detailsUrl: null,
  };
}

describe("isTerminalCloudSessionPhase", () => {
  it("treats exactly the ended phases as terminal", () => {
    for (const phase of ["requested", "queued", "preparing", "starting", "ready"] as const) {
      expect(isTerminalCloudSessionPhase(phase)).toBe(false);
    }
    expect(isTerminalCloudSessionPhase("failed")).toBe(true);
    expect(isTerminalCloudSessionPhase("stopped")).toBe(true);
  });
});

describe("splitCloudSessions", () => {
  it("splits active and terminal sessions, preserving list order in both halves", () => {
    const split = splitCloudSessions([
      session("a1", "ready"),
      session("h1", "stopped"),
      session("a2", "preparing"),
      session("h2", "failed"),
      session("a3", "queued"),
    ]);
    expect(split.active.map((item) => item.sessionId)).toEqual(["a1", "a2", "a3"]);
    expect(split.history.map((item) => item.sessionId)).toEqual(["h1", "h2"]);
    expect(split.hiddenHistoryCount).toBe(0);
  });

  it("caps history at the limit and counts the overflow", () => {
    const split = splitCloudSessions(
      Array.from({ length: 8 }, (_, index) => session(`h${index + 1}`, "stopped")),
    );
    expect(CLOUD_SESSION_HISTORY_LIMIT).toBe(5);
    expect(split.active).toEqual([]);
    expect(split.history.map((item) => item.sessionId)).toEqual(["h1", "h2", "h3", "h4", "h5"]);
    expect(split.hiddenHistoryCount).toBe(3);
  });

  it("does not cap history at or under the limit", () => {
    const split = splitCloudSessions([session("h1", "failed"), session("h2", "stopped")]);
    expect(split.history.map((item) => item.sessionId)).toEqual(["h1", "h2"]);
    expect(split.hiddenHistoryCount).toBe(0);
  });

  it("caps at a custom limit when one is supplied", () => {
    const split = splitCloudSessions(
      Array.from({ length: 4 }, (_, index) => session(`h${index + 1}`, "stopped")),
      2,
    );
    expect(split.history.map((item) => item.sessionId)).toEqual(["h1", "h2"]);
    expect(split.hiddenHistoryCount).toBe(2);
  });

  it("reports nothing for an empty list", () => {
    const split = splitCloudSessions([]);
    expect(split.active).toEqual([]);
    expect(split.history).toEqual([]);
    expect(split.hiddenHistoryCount).toBe(0);
  });
});

describe("runOnCloudSessions", () => {
  it("keeps provisioning sessions and the most recent failed one, in order", () => {
    const result = runOnCloudSessions([
      session("ready1", "ready"),
      session("prep1", "preparing"),
      session("failed2", "failed"),
      session("failed1", "failed"),
      session("queued1", "queued"),
      session("stopped1", "stopped"),
    ]);
    expect(result.map((item) => item.sessionId)).toEqual(["prep1", "failed2", "queued1"]);
  });

  it("includes only provisioning sessions when none have failed", () => {
    const result = runOnCloudSessions([session("ready1", "ready"), session("prep1", "preparing")]);
    expect(result.map((item) => item.sessionId)).toEqual(["prep1"]);
  });

  it("returns an empty list when nothing is worth showing", () => {
    expect(runOnCloudSessions([session("ready1", "ready"), session("stop1", "stopped")])).toEqual([]);
  });
});

describe("mergeLocalCloudSession", () => {
  it("shows the local session until the server list covers it", () => {
    const local = { session: session("pending:abc", "requested"), knownServerSessionIds: new Set(["old1"]) };
    expect(mergeLocalCloudSession([session("old1", "stopped")], local).map((item) => item.sessionId)).toEqual(["pending:abc", "old1"]);
    expect(mergeLocalCloudSession([], local).map((item) => item.sessionId)).toEqual(["pending:abc"]);
  });

  it("drops the local session when the same id appears in the server list", () => {
    const local = { session: session("real-1", "requested"), knownServerSessionIds: new Set<string>() };
    expect(mergeLocalCloudSession([session("real-1", "queued")], local)).toEqual([session("real-1", "queued")]);
  });

  it("drops the local session when a new session surfaces from the server", () => {
    // The dispatch indexed under its run id: a session that was not in the
    // pre-create snapshot now is.
    const local = { session: session("pending:abc", "requested"), knownServerSessionIds: new Set(["old1"]) };
    expect(mergeLocalCloudSession([session("run-9", "preparing"), session("old1", "stopped")], local))
      .toHaveLength(2);
  });

  it("passes the server list through when there is no local session", () => {
    const sessions = [session("a", "ready")];
    expect(mergeLocalCloudSession(sessions, null)).toBe(sessions);
  });
});
