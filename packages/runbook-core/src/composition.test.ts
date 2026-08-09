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
    // `workflow` is deliberately absent: a sub-run executes INLINE, in the caller's own journal
    // sequence, so it takes no primitive seat of its own. `parallel` and `pipeline` still do,
    // because their branches are concurrent and have to stay black-boxed to replay at all.
    expect(calls.map((call) => call.kind)).toEqual(["parallel", "pipeline", "wait"]);
  });

  it("does not black-box a sub-workflow: the child's own primitive calls reach the seat", async () => {
    const calls: PrimitiveCall<unknown>[] = [];
    let blackBoxDepth = 0;
    let depthSeenInsideChild = -1;
    const primitives = createWorkflowPrimitives({
      callPrimitive: async <R>(call: PrimitiveCall<R>): Promise<R> => {
        calls.push(call as PrimitiveCall<unknown>);
        return await call.exec();
      },
      runBlackBoxed: async (fn) => {
        blackBoxDepth += 1;
        try {
          return await fn();
        } finally {
          blackBoxDepth -= 1;
        }
      },
      sleep: async () => {},
      spent: () => 0,
      hostNow: () => 0,
      budgetTotal: 0,
      onPhase: () => {},
      onLog: () => {},
      // Stands in for a real child body: it makes one primitive call of its own, exactly as a
      // sub-workflow's `agent`/`wait`/`askUser` would.
      runSubWorkflow: async () => {
        depthSeenInsideChild = blackBoxDepth;
        await primitives.wait(1);
        return "child-done";
      },
    });

    await expect(primitives.workflow({ path: "./child.ts" })).resolves.toBe("child-done");

    // The whole point: the child ran OUTSIDE any black box, so its `wait` was journaled and could
    // have durably suspended. Sealed, it would have been depth 1 and invisible to the journal.
    expect(depthSeenInsideChild).toBe(0);
    expect(calls.map((call) => call.kind)).toEqual(["wait"]);
  });

  it("reports a missing sub-workflow executor rather than pretending nesting is capped", () => {
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

    expect(() => primitives.workflow({ path: "./nested.ts" })).toThrow("no sub-workflow executor");
  });
});
