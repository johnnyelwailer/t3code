import { describe, expect, it } from "vite-plus/test";

import { effectiveSprintState, resolveCurrentSprint } from "./sprintResolver.ts";

// Phil's real IES board 95 as cached on 2026-10-15 (Jira never completed 8.6).
const S85 = { id: "4447", name: "PW Sprint 8.5", state: "closed", boardId: "95", startDate: "2026-09-03T15:47:13.381Z", endDate: "2026-09-23T21:30:00.000Z" };
const S86 = { id: "4448", name: "PW Sprint 8.6", state: "active", boardId: "95", startDate: "2026-10-01T10:22:39.451Z", endDate: "2026-10-14T21:30:00.000Z" };
const S91 = { id: "7228", name: "PW Sprint 9.1", state: "future", boardId: "95", startDate: "2026-10-14T22:00:00.000Z", endDate: "2026-11-04T22:00:00.000Z" };
const S92 = { id: "7229", name: "PW Sprint 9.2", state: "future", boardId: "95", startDate: "2026-11-04T23:00:00.000Z", endDate: "2026-11-25T22:30:00.000Z" };
const OTHER = { id: "9001", name: "AI Sprint 3", state: "active", boardId: "772", startDate: "2026-10-08T00:00:00.000Z", endDate: "2026-10-22T00:00:00.000Z" };
const NOW = Date.parse("2026-10-15T08:00:00.000Z");
const ALL = [S85, S86, S91, S92];

describe("resolveCurrentSprint", () => {
  it("picks the calendar-current sprint over an ended-but-open Jira-active one", () => {
    const r = resolveCurrentSprint({ sprints: ALL, nowMs: NOW, viewerIssueCounts: new Map([["4448", 30], ["7228", 4]]) });
    expect(r.sprint?.name).toBe("PW Sprint 9.1");
    expect(r.boardId).toBe("95");
    expect(r.reason).toBe("calendar");
  });
  it("keeps a late-closing sprint while no successor has started", () => {
    const r = resolveCurrentSprint({ sprints: ALL, nowMs: Date.parse("2026-10-14T21:45:00.000Z") });
    expect(r.sprint?.id).toBe("4448");
    expect(r.reason).toBe("jira-active");
  });
  it("explicit choice wins and survives", () => {
    expect(resolveCurrentSprint({ sprints: ALL, nowMs: NOW, explicit: { sprintId: "7229" } }).sprint?.id).toBe("7229");
  });
  it("ignores an explicit choice that has closed", () => {
    expect(resolveCurrentSprint({ sprints: ALL, nowMs: NOW, explicit: { sprintId: "4447" } }).sprint?.id).toBe("7228");
  });
  it("prefers the board with most of the viewer's issues among concurrent sprints", () => {
    const counts = new Map([["7228", 6], ["9001", 1]]);
    expect(resolveCurrentSprint({ sprints: [OTHER, ...ALL], nowMs: NOW, viewerIssueCounts: counts }).sprint?.id).toBe("7228");
    expect(resolveCurrentSprint({ sprints: [OTHER, ...ALL], nowMs: NOW, preferredBoardId: "772" }).sprint?.id).toBe("9001");
  });
  it("an explicit board narrows the pool", () => {
    const r = resolveCurrentSprint({ sprints: [OTHER, ...ALL], nowMs: NOW, explicit: { boardId: "95" }, viewerIssueCounts: new Map([["9001", 9]]) });
    expect(r.sprint?.id).toBe("7228");
  });
  it("falls back to the next future sprint", () => {
    expect(resolveCurrentSprint({ sprints: [S92], nowMs: NOW }).sprint?.id).toBe("7229");
    expect(resolveCurrentSprint({ sprints: [S85], nowMs: NOW }).reason).toBe("none");
  });
});

describe("effectiveSprintState", () => {
  it("closes the ended sprint once its successor is current", () => {
    expect(effectiveSprintState(S86, S91, NOW)).toBe("closed");
    expect(effectiveSprintState(S91, S91, NOW)).toBe("active");
    expect(effectiveSprintState(S92, S91, NOW)).toBe("future");
    expect(effectiveSprintState(OTHER, S91, NOW)).toBe("active");
  });
});
