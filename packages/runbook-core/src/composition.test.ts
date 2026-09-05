import { describe, expect, it } from "vite-plus/test";

import { createWorkflowPrimitives, type CompositionBranchFailure } from "./composition.ts";
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
      hostUuid: () => "uuid-1",
      nowIso: () => "2026-01-01T00:00:00.000Z",
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
      hostUuid: () => "uuid-2",
      nowIso: () => "2026-01-01T00:00:00.000Z",
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
      hostUuid: () => "uuid-3",
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });

    expect(() => primitives.workflow({ path: "./nested.ts" })).toThrow("no sub-workflow executor");
  });

  it("still resolves a rejecting parallel() thunk to null while reporting it as a visible failure", async () => {
    const failures: CompositionBranchFailure[] = [];
    const primitives = createWorkflowPrimitives({
      callPrimitive: async <R>(call: PrimitiveCall<R>): Promise<R> => call.exec(),
      runBlackBoxed: async (fn) => fn(),
      sleep: async () => {},
      spent: () => 0,
      hostNow: () => 0,
      budgetTotal: 0,
      onPhase: () => {},
      onLog: () => {},
      hostUuid: () => "uuid-4",
      nowIso: () => "2026-01-01T00:00:00.000Z",
      onCompositionBranchFailed: (failure) => {
        failures.push(failure);
      },
    });

    // Reproduces the reported defect: a healthy branch alongside one whose thunk throws
    // synchronously, and a third branch whose rejection carries no message at all — the report
    // must describe that honestly instead of inventing text for it.
    await expect(
      primitives.parallel([
        async () => "ok",
        async () => {
          throw new Error("deliberate QA failure inside a parallel thunk");
        },
        async () => {
          throw undefined;
        },
      ]),
    ).resolves.toEqual(["ok", null, null]);

    expect(failures).toEqual([
      {
        compositionKind: "parallel",
        index: 1,
        total: 3,
        error: "deliberate QA failure inside a parallel thunk",
      },
      {
        compositionKind: "parallel",
        index: 2,
        total: 3,
        error: "undefined was thrown (no error message)",
      },
    ]);
  });

  it("still resolves a rejecting pipeline() item to null while reporting which stage threw", async () => {
    const failures: CompositionBranchFailure[] = [];
    const primitives = createWorkflowPrimitives({
      callPrimitive: async <R>(call: PrimitiveCall<R>): Promise<R> => call.exec(),
      runBlackBoxed: async (fn) => fn(),
      sleep: async () => {},
      spent: () => 0,
      hostNow: () => 0,
      budgetTotal: 0,
      onPhase: () => {},
      onLog: () => {},
      hostUuid: () => "uuid-5",
      nowIso: () => "2026-01-01T00:00:00.000Z",
      onCompositionBranchFailed: (failure) => {
        failures.push(failure);
      },
    });

    await expect(
      primitives.pipeline(
        ["a", "b"],
        async (value) => `${value}!`,
        async (value, _item, index) => {
          if (index === 1) throw new Error("stage two rejected");
          return value;
        },
      ),
    ).resolves.toEqual(["a!", null]);

    expect(failures).toEqual([
      {
        compositionKind: "pipeline",
        index: 1,
        total: 2,
        stageIndex: 1,
        stageTotal: 2,
        error: "stage two rejected",
      },
    ]);
  });

  it("swallows a throwing onCompositionBranchFailed hook without breaking the null contract", async () => {
    const primitives = createWorkflowPrimitives({
      callPrimitive: async <R>(call: PrimitiveCall<R>): Promise<R> => call.exec(),
      runBlackBoxed: async (fn) => fn(),
      sleep: async () => {},
      spent: () => 0,
      hostNow: () => 0,
      budgetTotal: 0,
      onPhase: () => {},
      onLog: () => {},
      hostUuid: () => "uuid-6",
      nowIso: () => "2026-01-01T00:00:00.000Z",
      onCompositionBranchFailed: () => {
        throw new Error("reporting itself is broken");
      },
    });

    await expect(
      primitives.parallel([
        async () => {
          throw new Error("thunk failure");
        },
      ]),
    ).resolves.toEqual([null]);
  });
});
