import { describe, expect, it } from "vite-plus/test";

import { createWorkflowPrimitives } from "./composition.ts";
import type { PrimitiveCall } from "./runtimeTypes.ts";

describe("@runbook/core composition primitives", () => {
  it("keeps composition behavior host-neutral while using one primitive seat", async () => {
    const calls: PrimitiveCall<unknown>[] = [];
    const primitive = async <R>(call: PrimitiveCall<R>): Promise<R> => {
      calls.push(call as PrimitiveCall<unknown>);
      return await call.exec();
    };
    const phases: string[] = [];
    const logs: string[] = [];
    const sleeps: number[] = [];
    let now = 100;
    const primitives = createWorkflowPrimitives({
      callPrimitive: primitive,
      runBlackBoxed: async (fn) => fn(),
      sleep: async (durationMs) => {
        sleeps.push(durationMs);
      },
      spent: () => 3,
      hostNow: () => now,
      budgetTotal: 10,
      onPhase: (title) => phases.push(title),
      onLog: (message) => logs.push(message),
      runSubWorkflow: async (ref, args) => ({ path: ref.path, args }),
    });

    await expect(
      primitives.parallel([
        async () => "ok",
        async () => {
          throw new Error("no");
        },
      ]),
    ).resolves.toEqual(["ok", null]);
    await expect(primitives.pipeline(["a", "b"], async (value) => `${value}!`)).resolves.toEqual([
      "a!",
      "b!",
    ]);
    await expect(primitives.workflow({ path: "./child.ts" }, { id: 1 })).resolves.toEqual({
      path: "./child.ts",
      args: { id: 1 },
    });
    await primitives.wait(5);
    primitives.phase("review");
    primitives.log("started");

    expect(primitives.budget.total).toBe(10);
    expect(primitives.budget.spent()).toBe(3);
    expect(primitives.budget.remaining()).toBe(7);
    expect(phases).toEqual(["review"]);
    expect(logs).toEqual(["started"]);
    expect(sleeps).toEqual([5]);
    expect(calls.map((call) => call.kind)).toEqual(["parallel", "pipeline", "workflow", "wait"]);
  });

  it("retains the one-level nested-workflow guard", () => {
    const primitives = createWorkflowPrimitives({
      callPrimitive: async <R>(call: PrimitiveCall<R>) => call.exec(),
      runBlackBoxed: async (fn) => fn(),
      sleep: async () => {},
      spent: () => 0,
      hostNow: () => 0,
      budgetTotal: 0,
      onPhase: () => {},
      onLog: () => {},
    });

    expect(() => primitives.workflow({ path: "./nested.ts" })).toThrow("one level of nesting only");
  });
});
