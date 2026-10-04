import { describe, expect, it, vi } from "vite-plus/test";

import {
  registerQueuedTurnStartHooks,
  runQueuedTurnStartHooks,
} from "./t3team-queuedTurnStartHooks";

const turnStart = {
  threadId: "thread-1",
  messageId: "message-1",
  messageText: "hello",
  modelSelection: { instanceId: "codex", model: "gpt-5.4" },
  titleSeed: "hello",
  runtimeMode: "full-access",
  interactionMode: "default",
  createdAt: "2026-09-27T00:00:00.000Z",
  hasAttachments: false,
} as Parameters<typeof runQueuedTurnStartHooks>[1];

describe("runQueuedTurnStartHooks", () => {
  it("falls through to the plain turn start when the thread is not on screen", async () => {
    expect(await runQueuedTurnStartHooks("env:missing", turnStart)).toBe(false);
  });

  it("syncs tool context before the override and skips the turn start when handled", async () => {
    const order: string[] = [];
    const unregister = registerQueuedTurnStartHooks("env:thread-1", {
      current: {
        beforeDispatchTurnStart: async () => void order.push("sync"),
        dispatchTurnStartOverride: async (input) => {
          order.push(`override:${input.messageText}`);
          return "resolved-input";
        },
      },
    });
    expect(await runQueuedTurnStartHooks("env:thread-1", turnStart)).toBe(true);
    expect(order).toEqual(["sync", "override:hello"]);
    unregister();
    expect(await runQueuedTurnStartHooks("env:thread-1", turnStart)).toBe(false);
  });

  it("starts the turn anyway when the tool-context sync fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const unregister = registerQueuedTurnStartHooks("env:thread-2", {
      current: {
        beforeDispatchTurnStart: async () => {
          throw new Error("sync down");
        },
        dispatchTurnStartOverride: async () => false,
      },
    });
    expect(await runQueuedTurnStartHooks("env:thread-2", turnStart)).toBe(false);
    expect(error).toHaveBeenCalled();
    unregister();
    error.mockRestore();
  });

  it("keeps a newer registration when an older view unmounts", async () => {
    const older = registerQueuedTurnStartHooks("env:thread-3", {
      current: { dispatchTurnStartOverride: async () => false },
    });
    const newer = registerQueuedTurnStartHooks("env:thread-3", {
      current: { dispatchTurnStartOverride: async () => true },
    });
    older();
    expect(await runQueuedTurnStartHooks("env:thread-3", turnStart)).toBe(true);
    newer();
  });
});
