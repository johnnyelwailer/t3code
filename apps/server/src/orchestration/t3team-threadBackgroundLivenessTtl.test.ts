import { describe, expect, it } from "vite-plus/test";
import * as ThreadBackgroundLiveness from "./ThreadBackgroundLiveness.ts";

/**
 * TTL (stranded-entry escape hatch, #475) for the background-liveness
 * registry: a task that emits no lifecycle row past the bound reads as
 * not-live, releasing every consumer of the registry — the engine's
 * decide-time auto-settle gate, the opted-in settle gate, the shell pill,
 * and the child-settle sweep's candidacy — instead of pinning them until
 * session death or a restart.
 */
describe("ThreadBackgroundLiveness — stranded-entry TTL", () => {
  const Ttl = 30 * 60 * 1_000; // 30 min, matching the default

  function clocked(ttlMs: number) {
    let t = 0;
    return {
      liveness: ThreadBackgroundLiveness.make({ ttlMs, now: () => t }),
      at: (ms: number) => {
        t = ms;
      },
    };
  }

  const startSubagent = (liveness: ReturnType<typeof ThreadBackgroundLiveness.make>) =>
    liveness.recordTaskLiveness({
      threadId: "thread",
      taskId: "task-1",
      taskType: "subagent",
      status: undefined,
      kind: "started",
    });

  it("stays live while the task keeps emitting rows", () => {
    const { liveness, at } = clocked(Ttl);
    startSubagent(liveness);
    at(5 * 60 * 1_000);
    expect(liveness.getThreadBackgroundLiveness("thread")).toBe("working");
    at(29 * 60 * 1_000); // still inside the bound of the original stamp
    liveness.recordTaskLiveness({
      threadId: "thread",
      taskId: "task-1",
      taskType: "subagent",
      status: "running",
      kind: "progress",
    });
    at(29 * 60 * 1_000 + 30 * 60 * 1_000 - 1); // 1ms inside the bound of the REFRESH
    expect(liveness.getThreadBackgroundLiveness("thread")).toBe("working");
  });

  it("reads a stranded entry as not-live once it outlives the bound", () => {
    const { liveness, at } = clocked(Ttl);
    startSubagent(liveness);
    at(Ttl - 1); // 1ms inside the bound: still live
    expect(liveness.getThreadBackgroundLiveness("thread")).toBe("working");
    at(Ttl); // exactly the bound: silent for 30 min means stranded, not live
    expect(liveness.getThreadBackgroundLiveness("thread")).toBeNull();
  });

  it("prunes the thread state: a status-free row after expiry does not resurrect the task", () => {
    // #7128 keeps its semantics after the prune: a delayed status-free
    // progress row must not put a task that is no longer in the live set
    // back into it — a pruned (stranded) entry is gone, not just hidden.
    const { liveness, at } = clocked(Ttl);
    startSubagent(liveness);
    at(Ttl);
    expect(liveness.getThreadBackgroundLiveness("thread")).toBeNull();
    liveness.recordTaskLiveness({
      threadId: "thread",
      taskId: "task-1",
      taskType: "subagent",
      status: undefined,
      kind: "progress",
    });
    expect(liveness.getThreadBackgroundLiveness("thread")).toBeNull();
    // A genuine NEW transition (a start row) DOES re-activate the task.
    liveness.recordTaskLiveness({
      threadId: "thread",
      taskId: "task-1",
      taskType: "subagent",
      status: "running",
      kind: "started",
    });
    expect(liveness.getThreadBackgroundLiveness("thread")).toBe("working");
  });

  it("a fresh monitor keeps the thread monitoring once the stranded agent expires", () => {
    const { liveness, at } = clocked(Ttl);
    startSubagent(liveness);
    liveness.recordTaskLiveness({
      threadId: "thread",
      taskId: "watch-1",
      taskType: "monitor",
      status: undefined,
      kind: "started",
    });
    expect(liveness.getThreadBackgroundLiveness("thread")).toBe("working"); // agents outrank monitors
    at(Ttl); // the agent went silent; the monitor was stamped at t=0 too...
    expect(liveness.getThreadBackgroundLiveness("thread")).toBeNull();
    // ...but a monitor still streaming rows keeps the thread live.
    at(Ttl + 1);
    liveness.recordTaskLiveness({
      threadId: "thread",
      taskId: "watch-1",
      taskType: "monitor",
      status: "watching",
      kind: "progress",
    });
    expect(liveness.getThreadBackgroundLiveness("thread")).toBe("monitoring");
  });

  it("clearThreadLiveness still releases immediately, ahead of the bound", () => {
    const { liveness } = clocked(Ttl);
    startSubagent(liveness);
    liveness.clearThreadLiveness("thread");
    expect(liveness.getThreadBackgroundLiveness("thread")).toBeNull();
  });

  it("defaults to the exported 30-minute bound, overridable via env", () => {
    expect(ThreadBackgroundLiveness.THREAD_BACKGROUND_LIVENESS_TTL_MS).toBe(30 * 60 * 1_000);
    expect(ThreadBackgroundLiveness.threadBackgroundLivenessTtlMs()).toBe(
      ThreadBackgroundLiveness.THREAD_BACKGROUND_LIVENESS_TTL_MS,
    );
    const prev = process.env["T3TEAM_THREAD_LIVENESS_TTL_MS"];
    try {
      process.env["T3TEAM_THREAD_LIVENESS_TTL_MS"] = "120000";
      expect(ThreadBackgroundLiveness.threadBackgroundLivenessTtlMs()).toBe(120_000);
      process.env["T3TEAM_THREAD_LIVENESS_TTL_MS"] = "not-a-number";
      expect(ThreadBackgroundLiveness.threadBackgroundLivenessTtlMs()).toBe(
        ThreadBackgroundLiveness.THREAD_BACKGROUND_LIVENESS_TTL_MS,
      );
    } finally {
      if (prev === undefined) delete process.env["T3TEAM_THREAD_LIVENESS_TTL_MS"];
      else process.env["T3TEAM_THREAD_LIVENESS_TTL_MS"] = prev;
    }
  });
});
