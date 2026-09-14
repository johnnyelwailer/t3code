import type { CloudSession, CloudSessionPhase } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  CLOUD_SESSION_HISTORY_LIMIT,
  isTerminalCloudSessionPhase,
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
