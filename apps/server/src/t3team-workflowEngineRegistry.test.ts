import { describe, expect, it, vi } from "vite-plus/test";

import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";

describe("workflow engine registry controls", () => {
  it("cancels the controller and removes every pending wake source for the run", () => {
    const registry = makeWorkflowEngineRegistry();
    const cancel = vi.fn();
    const cancelLive = vi.fn();
    registry.registerRun("run-1", { resume: async () => {}, cancel });
    registry.setPending("thread-1", {
      runId: "run-1",
      correlationId: "run-1:1",
      kind: "thread.turn",
      cancelLive,
    });

    registry.cancelRun("run-1");

    expect(cancel).toHaveBeenCalledOnce();
    expect(cancelLive).toHaveBeenCalledOnce();
    expect(registry.getRun("run-1")).toBeUndefined();
    expect(registry.peekPending("thread-1")).toBeUndefined();
  });

  it("pauses event delivery without deleting the resumable controller", () => {
    const registry = makeWorkflowEngineRegistry();
    registry.registerRun("run-1", { resume: async () => {}, cancel: () => {} });
    registry.setPending("thread-1", {
      runId: "run-1",
      correlationId: "run-1:1",
      kind: "user.input",
    });

    registry.removePendingForRun("run-1");

    expect(registry.getRun("run-1")).toBeDefined();
    expect(registry.peekPending("thread-1")).toBeUndefined();
  });

  it("tracks parent ownership and child threads for stop cascading", () => {
    const registry = makeWorkflowEngineRegistry();
    registry.registerRun("run-1", { resume: async () => {}, cancel: () => {} });
    registry.registerOwnership("run-1", "master-thread");
    registry.registerChildThread("run-1", "child-a");
    registry.registerChildThread("run-1", "child-b");

    expect(registry.runsOwnedByThread("master-thread")).toEqual(["run-1"]);
    expect(registry.childThreadsForRun("run-1")).toEqual(["child-a", "child-b"]);
  });

  it("keeps child registration idempotent for retried spawns", () => {
    const registry = makeWorkflowEngineRegistry();
    registry.registerChildThread("run-1", "child-a");
    registry.registerChildThread("run-1", "child-a");

    expect(registry.childThreadsForRun("run-1")).toEqual(["child-a"]);
  });

  it("resolves a child thread back to its run's launching thread (start_child re-parenting)", () => {
    const registry = makeWorkflowEngineRegistry();
    registry.registerRun("run-1", { resume: async () => {}, cancel: () => {} });
    registry.registerOwnership("run-1", "master-thread");
    registry.registerChildThread("run-1", "child-a");

    expect(registry.launchThreadForChildThread("child-a")).toBe("master-thread");
    // Not a workflow child / unknown thread → no re-parenting.
    expect(registry.launchThreadForChildThread("master-thread")).toBeUndefined();
    expect(registry.launchThreadForChildThread("unrelated")).toBeUndefined();

    // A completed (deleted) run stops re-parenting: its children are no longer live.
    registry.deleteRun("run-1");
    expect(registry.launchThreadForChildThread("child-a")).toBeUndefined();
  });
});
