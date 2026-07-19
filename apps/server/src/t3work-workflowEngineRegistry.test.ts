import { describe, expect, it, vi } from "vite-plus/test";

import { makeWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";

describe("workflow engine registry controls", () => {
  it("cancels the controller and removes every pending wake source for the run", () => {
    const registry = makeWorkflowEngineRegistry();
    const cancel = vi.fn();
    registry.registerRun("run-1", { resume: async () => {}, cancel });
    registry.setPending("thread-1", {
      runId: "run-1",
      correlationId: "run-1:1",
      kind: "thread.turn",
    });

    registry.cancelRun("run-1");

    expect(cancel).toHaveBeenCalledOnce();
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
});
