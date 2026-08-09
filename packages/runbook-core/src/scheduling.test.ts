import { describe, expect, it } from "vite-plus/test";

import { createSchedulePrimitives } from "./scheduling.ts";
import type { HandleDispatch, ReplyResolver } from "./handles.ts";

describe("@runbook/core scheduling", () => {
  it("delivers a durable wake request through the injected host port", async () => {
    const replies = new Map<string, unknown>();
    const requests: Array<{ correlationId: string; deadline: number }> = [];
    const dispatch: HandleDispatch = {
      send: async (call) => {
        const id = "run-1:1";
        await call.fire(id, {
          resolve: (reply) => replies.set(id, reply),
          reject: () => replies.delete(id),
        });
        return id;
      },
      sendOneWay: () => "unused",
      awaitResolution: async <R>(id: string) => replies.get(id) as R,
    };
    const schedule = createSchedulePrimitives({
      dispatch,
      delivery: {
        schedule: async (request, resolver) => {
          requests.push(request);
          resolver.resolve(undefined);
        },
      },
    });

    await schedule.waitUntil(1_700_000_000_000);
    expect(requests).toEqual([{ correlationId: "run-1:1", deadline: 1_700_000_000_000 }]);
  });

  it("lets the host retain its own denied-capability error", () => {
    const dispatch = {} as HandleDispatch;
    const denied = new Error("schedule denied by host");
    const schedule = createSchedulePrimitives({
      dispatch,
      delivery: { schedule: async (_request, _resolver: ReplyResolver) => {} },
      isAllowed: () => false,
      denied: () => denied,
    });

    expect(() => schedule.waitUntil(1)).toThrow(denied);
  });
});
