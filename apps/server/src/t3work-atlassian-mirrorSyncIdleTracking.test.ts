import { describe, expect, it } from "@effect/vitest";

import {
  clearT3workMirrorSyncKickHistory,
  isT3workMirrorSyncIdle,
  lastT3workMirrorSyncKickMs,
  recordT3workMirrorSyncKick,
} from "./t3work-atlassian-mirrorSyncIdleTracking.ts";

describe("isT3workMirrorSyncIdle", () => {
  it("is not idle while within the TTL", () => {
    const nowMs = 10 * 60_000;
    expect(isT3workMirrorSyncIdle({ nowMs, lastKickedMs: nowMs - 29 * 60_000 })).toBe(false);
  });

  it("is idle once the gap since the last kick reaches the 30 m TTL", () => {
    const nowMs = 60 * 60_000;
    expect(isT3workMirrorSyncIdle({ nowMs, lastKickedMs: nowMs - 30 * 60_000 })).toBe(true);
  });
});

describe("kick history tracking", () => {
  it("records and reads back a kick timestamp", () => {
    const key = "atlassian|acct-1|proj-1";
    clearT3workMirrorSyncKickHistory();
    expect(lastT3workMirrorSyncKickMs(key)).toBeUndefined();
    recordT3workMirrorSyncKick(key);
    expect(lastT3workMirrorSyncKickMs(key)).toBeTypeOf("number");
  });

  it("clearT3workMirrorSyncKickHistory forgets all recorded kicks", () => {
    const key = "atlassian|acct-2|proj-2";
    recordT3workMirrorSyncKick(key);
    expect(lastT3workMirrorSyncKickMs(key)).toBeTypeOf("number");
    clearT3workMirrorSyncKickHistory();
    expect(lastT3workMirrorSyncKickMs(key)).toBeUndefined();
  });
});
