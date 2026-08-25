import type { OrchestrationEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildSilenceDetectedPayload,
  buildSilenceMessageText,
  isReNotifyDue,
  isSilentBreach,
  parseThreadSilenceWatchEvent,
  THREAD_SILENCE_DEFAULT_TIMEOUT_MS,
  THREAD_SILENCE_DETECTED_KIND,
  THREAD_SILENCE_WATCH_CANCELLED_KIND,
  THREAD_SILENCE_WATCH_REGISTERED_KIND,
  type ThreadSilenceWatchRecord,
} from "./t3team-threadSilenceWatch.ts";
import { collectPendingThreadSilenceWatches } from "./t3team-threadSilenceWatchRehydrate.ts";

const watch = (over: Partial<ThreadSilenceWatchRecord> = {}): ThreadSilenceWatchRecord => ({
  watchId: "w1",
  watcherThreadId: "watcher",
  targetThreadId: "target",
  targetTitle: "QA child",
  timeoutMs: 900_000,
  ...over,
});

describe("isSilentBreach", () => {
  it("breaches exactly at the per-subscription timeout", () => {
    expect(isSilentBreach({ lastActivityAtMs: 0, nowMs: 899_999, timeoutMs: 900_000 })).toBe(false);
    expect(isSilentBreach({ lastActivityAtMs: 0, nowMs: 900_000, timeoutMs: 900_000 })).toBe(true);
    expect(isSilentBreach({ lastActivityAtMs: 0, nowMs: 1_000_000, timeoutMs: 900_000 })).toBe(
      true,
    );
  });

  it("honors different per-subscription timeouts", () => {
    // QA child: 900s; build child: 30m.
    expect(isSilentBreach({ lastActivityAtMs: 0, nowMs: 900_000, timeoutMs: 900_000 })).toBe(true);
    expect(isSilentBreach({ lastActivityAtMs: 0, nowMs: 900_000, timeoutMs: 1_800_000 })).toBe(
      false,
    );
    expect(isSilentBreach({ lastActivityAtMs: 0, nowMs: 1_800_000, timeoutMs: 1_800_000 })).toBe(
      true,
    );
  });
});

describe("isReNotifyDue", () => {
  it("fires immediately when never notified", () => {
    expect(isReNotifyDue({ lastNotifiedAtMs: undefined, nowMs: 0, timeoutMs: 900_000 })).toBe(true);
  });

  it("re-fires at each multiple of the timeout, not before", () => {
    expect(isReNotifyDue({ lastNotifiedAtMs: 900_000, nowMs: 1_799_999, timeoutMs: 900_000 })).toBe(
      false,
    );
    expect(isReNotifyDue({ lastNotifiedAtMs: 900_000, nowMs: 1_800_000, timeoutMs: 900_000 })).toBe(
      true,
    );
    expect(
      isReNotifyDue({ lastNotifiedAtMs: 1_800_000, nowMs: 2_700_000, timeoutMs: 900_000 }),
    ).toBe(true);
  });
});

describe("collectPendingThreadSilenceWatches", () => {
  const registered = (
    watcher: string,
    target: string,
    watchId: string,
    timeoutMs?: number,
  ): OrchestrationEvent =>
    ({
      type: "thread.activity-appended",
      payload: {
        threadId: watcher,
        activity: {
          kind: THREAD_SILENCE_WATCH_REGISTERED_KIND,
          payload: {
            watchId,
            targetThreadId: target,
            targetTitle: "QA child",
            ...(timeoutMs !== undefined ? { timeoutMs } : {}),
          },
        },
      },
    }) as unknown as OrchestrationEvent;

  const cancelled = (watcher: string, target: string): OrchestrationEvent =>
    ({
      type: "thread.activity-appended",
      payload: {
        threadId: watcher,
        activity: {
          kind: THREAD_SILENCE_WATCH_CANCELLED_KIND,
          payload: { targetThreadId: target },
        },
      },
    }) as unknown as OrchestrationEvent;

  it("keeps registered watches and drops cancelled ones", () => {
    const events = [registered("w", "t1", "a"), registered("w", "t2", "b"), cancelled("w", "t1")];
    const pending = collectPendingThreadSilenceWatches(events);
    expect(pending.map((record) => record.watchId)).toEqual(["b"]);
    expect(pending[0]).toMatchObject({
      watcherThreadId: "w",
      targetThreadId: "t2",
      targetTitle: "QA child",
      timeoutMs: THREAD_SILENCE_DEFAULT_TIMEOUT_MS,
    });
  });

  it("a cancel only drops that watcher's watches on that target", () => {
    const events = [
      registered("w1", "t", "a"),
      registered("w2", "t", "b"),
      registered("w1", "other", "c"),
      cancelled("w1", "t"),
    ];
    const pending = collectPendingThreadSilenceWatches(events);
    expect(pending.map((record) => record.watchId).sort()).toEqual(["b", "c"]);
  });

  it("defaults missing/invalid timeouts to the default and dedupes watch ids", () => {
    const events = [
      registered("w", "t1", "a", 1_800_000),
      registered("w", "t1", "a", 1), // duplicate id: first wins
      registered("w", "t2", "b", Number.NaN as unknown as number),
    ];
    const pending = collectPendingThreadSilenceWatches(events);
    expect(pending).toHaveLength(2);
    expect(pending.find((record) => record.watchId === "a")?.timeoutMs).toBe(1_800_000);
    expect(pending.find((record) => record.watchId === "b")?.timeoutMs).toBe(
      THREAD_SILENCE_DEFAULT_TIMEOUT_MS,
    );
  });
  describe("parseThreadSilenceWatchEvent", () => {
    it("parses a registered watch event into a record", () => {
      const event = registered("watcher-1", "target-1", "w-1", 1_800_000);
      const action = parseThreadSilenceWatchEvent(event);
      expect(action).toEqual({
        type: "registered",
        record: {
          watchId: "w-1",
          watcherThreadId: "watcher-1",
          targetThreadId: "target-1",
          targetTitle: "QA child",
          timeoutMs: 1_800_000,
        },
      });
    });

    it("parses a cancelled watch event", () => {
      const event = cancelled("watcher-1", "target-1");
      expect(parseThreadSilenceWatchEvent(event)).toEqual({
        type: "cancelled",
        watcherThreadId: "watcher-1",
        targetThreadId: "target-1",
      });
    });

    it("returns null for non-watch events and malformed payloads", () => {
      const other = {
        type: "thread.activity-appended",
        payload: {
          threadId: "w",
          activity: { kind: "t3team.child_wait.registered", payload: {} },
        },
      } as unknown as OrchestrationEvent;
      expect(parseThreadSilenceWatchEvent(other)).toBeNull();

      const malformed = {
        type: "thread.activity-appended",
        payload: {
          threadId: "w",
          activity: { kind: THREAD_SILENCE_WATCH_REGISTERED_KIND, payload: { watchId: 42 } },
        },
      } as unknown as OrchestrationEvent;
      expect(parseThreadSilenceWatchEvent(malformed)).toBeNull();
    });
  });
});

describe("buildSilenceDetectedPayload / buildSilenceMessageText", () => {
  it("carries the pending-tool distinction in the payload", () => {
    const withTool = buildSilenceDetectedPayload({
      watch: watch(),
      reason: "silent",
      silentSinceIso: "2026-08-23T10:00:00.000Z",
      silentForMs: 900_000,
      pendingToolCall: true,
      pendingToolCount: 2,
    });
    expect(withTool).toEqual({
      watchId: "w1",
      targetThreadId: "target",
      targetTitle: "QA child",
      reason: "silent",
      silentSinceIso: "2026-08-23T10:00:00.000Z",
      silentForMs: 900_000,
      timeoutMs: 900_000,
      pendingToolCall: true,
      pendingToolCount: 2,
    });
    expect(withTool).not.toHaveProperty("stoppedStatus");
    expect(buildSilenceMessageText(withTool)).toContain(
      "A tool call was still in progress (2 open)",
    );
    expect(buildSilenceMessageText(withTool)).toContain("[Thread silent]");

    const noTool = buildSilenceDetectedPayload({
      watch: watch(),
      reason: "silent",
      silentSinceIso: "2026-08-23T10:00:00.000Z",
      silentForMs: 900_000,
      pendingToolCall: false,
      pendingToolCount: 0,
    });
    expect(noTool.pendingToolCall).toBe(false);
    expect(buildSilenceMessageText(noTool)).toContain("No tool call was in progress");
    expect(buildSilenceMessageText(noTool)).toContain("may be wedged");
  });

  it("the stopped payload carries the terminal status", () => {
    const payload = buildSilenceDetectedPayload({
      watch: watch(),
      reason: "stopped",
      silentSinceIso: "2026-08-23T11:00:00.000Z",
      silentForMs: 12_000,
      pendingToolCall: false,
      pendingToolCount: 0,
      stoppedStatus: "error",
    });
    expect(payload.reason).toBe("stopped");
    expect(payload.stoppedStatus).toBe("error");
    expect(buildSilenceMessageText(payload)).toContain("[Thread stopped]");
    expect(buildSilenceMessageText(payload)).toContain("terminal state (error)");
  });
});

describe("activity kinds", () => {
  it("uses the t3team durable-activity namespace", () => {
    expect(THREAD_SILENCE_WATCH_REGISTERED_KIND).toBe("t3team.thread_silence.watch.registered");
    expect(THREAD_SILENCE_WATCH_CANCELLED_KIND).toBe("t3team.thread_silence.watch.cancelled");
    expect(THREAD_SILENCE_DETECTED_KIND).toBe("t3team.thread_silence.detected");
  });
});
