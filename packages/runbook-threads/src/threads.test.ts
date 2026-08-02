import { describe, expect, it } from "vite-plus/test";

import type { HandleDispatch, ReplyResolver } from "@runbook/core/handles";
import { createMockBroker } from "./broker.ts";
import { createThreadPrimitives } from "./primitives.ts";
import type { Thread, WorkflowThreadPrimitives } from "./index.ts";

describe("@runbook/threads contracts", () => {
  it("describes an adapter-owned thread without imposing a broker", async () => {
    const thread: Thread = {
      id: { kind: "thread-ref", id: "child-1" },
      askAgent: async <R = string>(prompt: string) => `agent:${prompt}` as R,
      notifyAgent: () => {},
      askUser: async <R = string>(question: string) => `user:${question}` as R,
      notifyUser: () => {},
      showWidget: () => {},
    };
    const primitives: WorkflowThreadPrimitives = {
      thread,
      spawnThread: () => thread,
      agent: (prompt) => thread.askAgent(prompt),
    };

    expect(await primitives.agent("review", { capabilities: "inherit" })).toBe("agent:review");
    expect(await primitives.thread?.askUser("approve")).toBe("user:approve");
  });

  it("runs the generic agent/thread constructor through an injected broker", async () => {
    let nextId = 0;
    const replies = new Map<string, unknown>();
    const dispatch: HandleDispatch = {
      send: async (call) => {
        const id = `run-1:${++nextId}`;
        const resolver: ReplyResolver = {
          resolve: (reply) => replies.set(id, reply),
          reject: () => replies.set(id, undefined),
        };
        await call.fire(id, resolver);
        return id;
      },
      sendOneWay: (call) => {
        const id = `run-1:${++nextId}`;
        void call.fire(id, { resolve: () => {}, reject: () => {} });
        return id;
      },
      awaitResolution: async <R>(id: string) => replies.get(id) as R,
    };
    const broker = createMockBroker(() => ({ kind: "resolve", reply: "generic reply" }));
    const primitives = createThreadPrimitives({
      dispatch,
      broker,
      capabilities: new Set(["user"]),
      launchThreadId: "launch-thread",
      defaultModel: undefined,
    });

    await expect(primitives.agent("review", { capabilities: "inherit" })).resolves.toBe(
      "generic reply",
    );
    expect(broker.sent.map((entry) => entry.kind)).toEqual(["thread.create", "thread.turn"]);
  });

  it("enforces the host-neutral user capability before broker delivery", () => {
    const dispatch = {
      send: async () => "run-1:1",
      sendOneWay: () => "run-1:1",
      awaitResolution: async <R>() => undefined as R,
    } satisfies HandleDispatch;
    const primitives = createThreadPrimitives({
      dispatch,
      broker: createMockBroker(() => ({ kind: "defer" })),
      capabilities: new Set<string>(),
      launchThreadId: "launch-thread",
      defaultModel: undefined,
    });

    expect(() => primitives.thread?.notifyUser("hello")).toThrow("'notifyUser'");
  });
});
