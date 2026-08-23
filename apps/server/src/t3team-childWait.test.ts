import { describe, expect, it } from "vite-plus/test";
import { ThreadId, type OrchestrationEvent } from "@t3tools/contracts";

import {
  childWaitOutcomeMatches,
  collectPendingChildWaits,
  makeChildWaitIndex,
  makeChildWaitScheduler,
  sessionStatusToWaitOutcome,
  type ChildWaitRecord,
} from "./t3team-childWait.ts";

describe("sessionStatusToWaitOutcome", () => {
  it("maps terminal session statuses", () => {
    expect(sessionStatusToWaitOutcome("idle")).toBe("completed");
    expect(sessionStatusToWaitOutcome("ready")).toBe("completed");
    expect(sessionStatusToWaitOutcome("error")).toBe("failed");
    expect(sessionStatusToWaitOutcome("interrupted")).toBe("aborted");
    expect(sessionStatusToWaitOutcome("stopped")).toBe("aborted");
  });
  it("is null for non-terminal statuses", () => {
    expect(sessionStatusToWaitOutcome("running")).toBeNull();
    expect(sessionStatusToWaitOutcome("starting")).toBeNull();
  });
});

describe("childWaitOutcomeMatches", () => {
  it("terminal matches any terminal outcome", () => {
    expect(childWaitOutcomeMatches("completed", "terminal")).toBe(true);
    expect(childWaitOutcomeMatches("failed", "terminal")).toBe(true);
    expect(childWaitOutcomeMatches("aborted", "terminal")).toBe(true);
    expect(childWaitOutcomeMatches("timeout", "terminal")).toBe(false);
  });
  it("completed matches only completed", () => {
    expect(childWaitOutcomeMatches("completed", "completed")).toBe(true);
    expect(childWaitOutcomeMatches("failed", "completed")).toBe(false);
  });
  it("failed matches only failed", () => {
    expect(childWaitOutcomeMatches("failed", "failed")).toBe(true);
    expect(childWaitOutcomeMatches("completed", "failed")).toBe(false);
    expect(childWaitOutcomeMatches("aborted", "failed")).toBe(false);
  });
});

const record = (over: Partial<ChildWaitRecord> = {}): ChildWaitRecord => ({
  waitId: "w1",
  parentThreadId: "parent",
  childThreadId: "child",
  childTitle: "child",
  on: "terminal",
  ...over,
});

describe("makeChildWaitIndex", () => {
  it("indexes by child and dedups by waitId", () => {
    const index = makeChildWaitIndex();
    index.add(record());
    index.add(record()); // duplicate waitId
    expect(index.all()).toHaveLength(1);
    expect(index.forChild("child")).toHaveLength(1);
    index.add(record({ waitId: "w2", childThreadId: "other" }));
    expect(index.all()).toHaveLength(2);
    expect(index.forChild("child")).toHaveLength(1);
    expect(index.forChild("other")).toHaveLength(1);
  });
  it("removes by waitId and prunes empty child buckets", () => {
    const index = makeChildWaitIndex();
    index.add(record());
    index.remove("w1");
    expect(index.all()).toHaveLength(0);
    expect(index.forChild("child")).toHaveLength(0);
  });
  it("computes the soonest deadline and due set", () => {
    const index = makeChildWaitIndex();
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    index.add(record({ waitId: "a", deadlineIso: "2026-01-01T00:05:00.000Z" }));
    index.add(record({ waitId: "b", deadlineIso: "2026-01-01T00:01:00.000Z" }));
    index.add(record({ waitId: "c" })); // no deadline
    expect(index.soonestDeadlineMs(now)).toBe(Date.parse("2026-01-01T00:01:00.000Z"));
    expect(index.due(now)).toHaveLength(0);
    const later = Date.parse("2026-01-01T00:02:00.000Z");
    expect(index.due(later).map((r) => r.waitId)).toEqual(["b"]);
  });
  it("reports an already-due deadline as 0", () => {
    const index = makeChildWaitIndex();
    index.add(record({ deadlineIso: "2026-01-01T00:00:00.000Z" }));
    expect(index.soonestDeadlineMs(Date.parse("2026-01-01T01:00:00.000Z"))).toBe(0);
  });
});

describe("makeChildWaitScheduler", () => {
  it("fires the timer for due waits and re-arms for the next", async () => {
    let now = Date.parse("2026-01-01T00:00:00.000Z");
    const timers: Array<{ cb: () => void; delay: number; handle: number }> = [];
    let handleSeq = 0;
    const clock = {
      now: () => now,
      setTimer: (cb: () => void, delay: number) => {
        const handle = handleSeq++;
        timers.push({ cb, delay, handle });
        return handle;
      },
      clearTimer: (handle: unknown) => {
        const i = timers.findIndex((t) => t.handle === handle);
        if (i >= 0) timers.splice(i, 1);
      },
    };
    const index = makeChildWaitIndex();
    const resolved: string[] = [];
    index.add(record({ waitId: "due", deadlineIso: "2026-01-01T00:01:00.000Z" }));
    index.add(record({ waitId: "later", deadlineIso: "2026-01-01T00:05:00.000Z" }));
    const scheduler = makeChildWaitScheduler({
      index,
      clock,
      resolveDue: async (records) => {
        for (const r of records) {
          resolved.push(r.waitId);
          index.remove(r.waitId);
        }
      },
    });
    await scheduler.rearm();
    // Armed for the soonest (due at +1m).
    expect(timers).toHaveLength(1);
    expect(timers[0]!.delay).toBe(60_000);
    // Advance the clock past the first deadline and fire the timer (a fired
    // timer is consumed, so drop it from the tracked set like clearTimeout).
    now = Date.parse("2026-01-01T00:01:00.000Z");
    const fired = timers[0]!;
    timers.splice(timers.indexOf(fired), 1);
    await new Promise<void>((resolve) => {
      fired.cb();
      setImmediate(resolve);
    });
    expect(resolved).toEqual(["due"]);
    // Re-armed for the remaining "later" wait.
    expect(timers).toHaveLength(1);
    expect(timers[0]!.delay).toBe(4 * 60_000);
    scheduler.stop();
  });

  it("arms at the floor for an already-due deadline (no hot loop)", async () => {
    const now = Date.parse("2026-01-01T01:00:00.000Z");
    const timers: Array<{ cb: () => void; delay: number }> = [];
    const clock = {
      now: () => now,
      setTimer: (cb: () => void, delay: number) => {
        timers.push({ cb, delay });
        return timers.length;
      },
      clearTimer: (_handle: unknown) => {},
    };
    const index = makeChildWaitIndex();
    index.add(record({ deadlineIso: "2026-01-01T00:00:00.000Z" })); // already due
    const scheduler = makeChildWaitScheduler({
      index,
      clock,
      resolveDue: async () => {},
    });
    await scheduler.rearm();
    expect(timers[0]!.delay).toBe(1000); // MIN_DUE_DELAY_MS floor
    scheduler.stop();
  });
});

const activityEvent = (threadId: string, kind: string, payload: unknown): OrchestrationEvent =>
  ({
    type: "thread.activity-appended",
    payload: {
      threadId: ThreadId.make(threadId),
      activity: {
        id: "evt-1",
        tone: "info",
        kind,
        summary: "s",
        payload,
        turnId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    },
  }) as unknown as OrchestrationEvent;

describe("collectPendingChildWaits", () => {
  it("keeps registered waits and drops resolved ones", () => {
    const events = [
      activityEvent("parent", "t3team.child_wait.registered", {
        waitId: "w1",
        childThreadId: "child",
        childTitle: "child",
        on: "failed",
        deadlineIso: "2026-01-01T01:00:00.000Z",
      }),
      activityEvent("parent", "t3team.child_wait.registered", {
        waitId: "w2",
        childThreadId: "child2",
        on: "terminal",
      }),
      activityEvent("parent", "t3team.child_wait.resolved", { waitId: "w1" }),
    ];
    const pending = collectPendingChildWaits(events);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.waitId).toBe("w2");
    expect(pending[0]!.on).toBe("terminal");
  });
  it("defaults a missing on to terminal and ignores malformed payloads", () => {
    const events = [
      activityEvent("parent", "t3team.child_wait.registered", {
        waitId: "w1",
        childThreadId: "child",
      }),
      activityEvent("parent", "t3team.child_wait.registered", { waitId: "bad" }),
    ];
    const pending = collectPendingChildWaits(events);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.on).toBe("terminal");
  });
});
