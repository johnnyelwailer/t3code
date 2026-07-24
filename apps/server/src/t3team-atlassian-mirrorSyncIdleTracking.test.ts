import { describe, expect, it } from "@effect/vitest";

import {
  clearT3TeamMirrorSyncKickHistory,
  isT3TeamMirrorSyncIdle,
  lastT3TeamMirrorSyncKickMs,
  recordT3TeamMirrorSyncKick,
} from "./t3team-atlassian-mirrorSyncIdleTracking.ts";

describe("isT3TeamMirrorSyncIdle", () => {
  it("is not idle while within the TTL", () => {
    const nowMs = 10 * 60_000;
    expect(isT3TeamMirrorSyncIdle({ nowMs, lastKickedMs: nowMs - 29 * 60_000 })).toBe(false);
  });

  it("is idle once the gap since the last kick reaches the 30 m TTL", () => {
    const nowMs = 60 * 60_000;
    expect(isT3TeamMirrorSyncIdle({ nowMs, lastKickedMs: nowMs - 30 * 60_000 })).toBe(true);
  });
});

describe("kick history tracking", () => {
  it("records and reads back a kick timestamp", () => {
    const key = "atlassian|acct-1|proj-1";
    clearT3TeamMirrorSyncKickHistory();
    expect(lastT3TeamMirrorSyncKickMs(key)).toBeUndefined();
    recordT3TeamMirrorSyncKick(key);
    expect(lastT3TeamMirrorSyncKickMs(key)).toBeTypeOf("number");
  });

  it("clearT3TeamMirrorSyncKickHistory forgets all recorded kicks", () => {
    const key = "atlassian|acct-2|proj-2";
    recordT3TeamMirrorSyncKick(key);
    expect(lastT3TeamMirrorSyncKickMs(key)).toBeTypeOf("number");
    clearT3TeamMirrorSyncKickHistory();
    expect(lastT3TeamMirrorSyncKickMs(key)).toBeUndefined();
  });
});
