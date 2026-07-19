import { describe, expect, it, vi } from "vite-plus/test";

import { makeWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";
import { stopWorkflowsOwnedByThread } from "./t3work-workflowStopCascade.ts";

describe("stopWorkflowsOwnedByThread", () => {
  it("durably cancels owned workflows and interrupts every controlled child", async () => {
    const registry = makeWorkflowEngineRegistry();
    const cancelController = vi.fn();
    const durableStop = vi.fn(async () => {});
    const dispatched: unknown[] = [];
    registry.registerRun("run-1", { resume: async () => {}, cancel: cancelController });
    registry.registerOwnership("run-1", "master");
    registry.registerMasterStop("run-1", durableStop);
    registry.registerChildThread("run-1", "child-a");
    registry.registerChildThread("run-1", "child-b");

    await stopWorkflowsOwnedByThread({
      registry,
      threadId: "master",
      createdAt: "2026-07-19T00:00:00.000Z",
      dispatch: async (command) => {
        dispatched.push(command);
      },
    });

    expect(durableStop).toHaveBeenCalledOnce();
    expect(cancelController).toHaveBeenCalledOnce();
    expect(registry.getRun("run-1")).toBeUndefined();
    expect(dispatched).toEqual([
      expect.objectContaining({ type: "thread.turn.interrupt", threadId: "child-a" }),
      expect.objectContaining({ type: "thread.turn.interrupt", threadId: "child-b" }),
    ]);
  });
});
