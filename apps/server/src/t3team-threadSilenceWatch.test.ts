import { type OrchestrationV2DomainEvent, RunId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import {
  buildSilentNoticeText,
  buildStoppedNoticeText,
  classifySilenceWatchTarget,
  isReNotifyDue,
  isSilentBreach,
  type SilenceWatchTargetView,
  silentNoticeMessageId,
  stoppedNoticeMessageId,
  type ThreadSilenceWatchRecord,
} from "./t3team-threadSilenceWatch.ts";
import { makeSilenceActivityTracker } from "./t3team-threadSilenceWatchActivity.ts";

const watch = (over: Partial<ThreadSilenceWatchRecord> = {}): ThreadSilenceWatchRecord => ({
  watchId: "w1",
  watcherThreadId: "watcher",
  targetThreadId: "target",
  targetTitle: "QA child",
  timeoutMs: 900_000,
  notifyCount: 0,
  lastNotifiedAtMs: null,
  ...over,
});

const target = (over: Partial<SilenceWatchTargetView> = {}): SilenceWatchTargetView => ({
  status: "completed",
  latestRunId: RunId.make("run-1"),
  activityRunStatus: null,
  pendingBackgroundTasks: [],
  settledAt: null,
  ...over,
});

const event = (type: string, payload: unknown, atMs: number, threadId = "target") =>
  ({
    type,
    threadId: ThreadId.make(threadId),
    occurredAt: DateTime.makeUnsafe(atMs),
    payload,
  }) as unknown as OrchestrationV2DomainEvent;

const toolItem = (id: string, status: string, type = "command_execution") =>
  event("turn-item.updated", { id, type, status }, 1_000);

describe("classifySilenceWatchTarget", () => {
  it("keeps watching an active run, pending background work or a thread with no run yet", () => {
    expect(classifySilenceWatchTarget(target({ activityRunStatus: "running" }))).toEqual({
      kind: "live",
    });
    const task = { taskId: "t1", kind: "command" } as never;
    expect(classifySilenceWatchTarget(target({ pendingBackgroundTasks: [task] })).kind).toBe(
      "live",
    );
    expect(classifySilenceWatchTarget(target({ status: "idle", latestRunId: null })).kind).toBe(
      "live",
    );
  });

  it("closes silently when the turn ended normally and nothing keeps the thread busy", () => {
    expect(classifySilenceWatchTarget(target({ status: "completed" })).kind).toBe("resting");
    expect(classifySilenceWatchTarget(target({ status: "idle" })).kind).toBe("resting");
  });

  it("reports true stops with a per-episode key", () => {
    expect(classifySilenceWatchTarget(target({ status: "failed" }))).toEqual({
      kind: "stopped",
      status: "failed",
      episode: "run:run-1",
    });
    expect(classifySilenceWatchTarget(null)).toEqual({
      kind: "stopped",
      status: "deleted",
      episode: "deleted",
    });
    const settledAt = DateTime.makeUnsafe("2026-10-01T00:00:00.000Z");
    expect(classifySilenceWatchTarget(target({ settledAt }))).toEqual({
      kind: "stopped",
      status: "settled",
      episode: "settled:2026-10-01T00:00:00.000Z",
    });
  });
});

describe("breach and re-notify rules", () => {
  it("breaches exactly at the per-subscription timeout", () => {
    expect(isSilentBreach({ lastActivityAtMs: 0, nowMs: 899_999, timeoutMs: 900_000 })).toBe(false);
    expect(isSilentBreach({ lastActivityAtMs: 0, nowMs: 900_000, timeoutMs: 900_000 })).toBe(true);
  });

  it("fires when never notified, then only at each multiple of the timeout", () => {
    expect(isReNotifyDue({ lastNotifiedAtMs: null, nowMs: 0, timeoutMs: 900_000 })).toBe(true);
    expect(isReNotifyDue({ lastNotifiedAtMs: 900_000, nowMs: 1_799_999, timeoutMs: 900_000 })).toBe(
      false,
    );
    expect(isReNotifyDue({ lastNotifiedAtMs: 900_000, nowMs: 1_800_000, timeoutMs: 900_000 })).toBe(
      true,
    );
  });
});

describe("notice text and ids", () => {
  it("distinguishes silence with and without a tool call in progress", () => {
    const withTool = buildSilentNoticeText(watch(), { silentForMs: 900_000, pendingToolCount: 2 });
    expect(withTool).toContain("[Thread silent]");
    expect(withTool).toContain("A tool call was still in progress (2 open)");
    expect(withTool).toContain("15m");
    const noTool = buildSilentNoticeText(watch(), { silentForMs: 900_000, pendingToolCount: 0 });
    expect(noTool).toContain("may be wedged");
    expect(buildStoppedNoticeText(watch(), "failed")).toContain("terminal state (failed)");
  });

  it("numbers silent notices per watch and keys stop notices per watcher, target and episode", () => {
    expect(silentNoticeMessageId("w1", 2)).toBe("t3team-silence:w1:silent:2");
    expect(stoppedNoticeMessageId(watch(), "run:r1")).toBe(
      stoppedNoticeMessageId(watch({ watchId: "w2" }), "run:r1"),
    );
  });
});

describe("makeSilenceActivityTracker", () => {
  it("tracks only seeded threads and keeps the latest activity stamp", () => {
    const tracker = makeSilenceActivityTracker();
    tracker.note(event("message.updated", {}, 5_000));
    expect(tracker.get("target")).toBeUndefined();
    tracker.seed("target", 2_000, []);
    tracker.note(event("message.updated", {}, 5_000));
    tracker.note(event("message.updated", {}, 4_000));
    expect(tracker.get("target")).toEqual({ lastActivityAtMs: 5_000, pendingToolCount: 0 });
    tracker.note(event("thread.visited", {}, 9_000));
    expect(tracker.get("target")?.lastActivityAtMs).toBe(5_000);
  });

  it("counts in-progress tool items by id, so repeats and lost updates cannot drift", () => {
    const tracker = makeSilenceActivityTracker();
    tracker.seed("target", 0, ["seeded"]);
    tracker.note(toolItem("a", "running"));
    tracker.note(toolItem("a", "running"));
    tracker.note(toolItem("b", "pending", "dynamic_tool"));
    tracker.note(toolItem("c", "running", "assistant_message"));
    expect(tracker.get("target")?.pendingToolCount).toBe(3);
    tracker.note(toolItem("a", "completed"));
    tracker.note(toolItem("unknown", "completed"));
    expect(tracker.get("target")?.pendingToolCount).toBe(2);
    tracker.note(event("run.updated", { status: "interrupted" }, 2_000));
    expect(tracker.get("target")?.pendingToolCount).toBe(0);
  });

  it("live state wins over a later seed; retain drops unwatched threads", () => {
    const tracker = makeSilenceActivityTracker();
    tracker.seed("target", 7_000, []);
    tracker.seed("target", 1_000, ["x"]);
    expect(tracker.get("target")).toEqual({ lastActivityAtMs: 7_000, pendingToolCount: 0 });
    tracker.seed("other", 0, []);
    tracker.retain(new Set(["other"]));
    expect(tracker.isTracked("target")).toBe(false);
    expect(tracker.isTracked("other")).toBe(true);
  });
});
