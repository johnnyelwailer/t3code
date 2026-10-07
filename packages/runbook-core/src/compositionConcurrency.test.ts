import { describe, expect, it } from "vite-plus/test";

import { createWorkflowPrimitives, type WorkflowPrimitivesDeps } from "./composition.ts";
import { createDurableRuntime } from "./durableRuntime.ts";
import type { JournalEntry } from "./journalReader.ts";
import { WorkflowSuspended } from "./handles.ts";
import type { PrimitiveCall } from "./runtimeTypes.ts";

const deps: WorkflowPrimitivesDeps = {
  callPrimitive: async <R>(call: PrimitiveCall<R>) => call.exec(),
  runBlackBoxed: async (fn) => fn(),
  sleep: async () => {},
  spent: () => 0,
  hostNow: () => 0,
  budgetTotal: 0,
  onPhase: () => {},
  onLog: () => {},
  hostUuid: () => "id",
  nowIso: () => "2026-10-07T00:00:00.000Z",
};

describe("composition concurrency", () => {
  const kinds = ["parallel", "pipeline"] as const;
  it.each(kinds)(
    "%s caps active branches and preserves order after out-of-order completion",
    async (kind) => {
      const primitives = createWorkflowPrimitives(deps);
      const gates = Array.from({ length: 5 }, () => Promise.withResolvers<void>());
      const started = Array.from({ length: 5 }, () => Promise.withResolvers<void>());
      const starts: number[] = [];
      let active = 0;
      let maxActive = 0;
      const branch = async (index: number) => {
        starts.push(index);
        active++;
        maxActive = Math.max(maxActive, active);
        started[index]!.resolve();
        await gates[index]!.promise;
        active--;
        return index;
      };
      const result =
        kind === "parallel"
          ? primitives.parallel(
              gates.map((_, index) => () => branch(index)),
              { concurrency: 2 },
            )
          : primitives.pipeline(
              [0, 1, 2, 3, 4],
              async (_prev, _item, index) => branch(index),
              async (prev) => prev,
              { concurrency: 2 },
            );
      await started[1]!.promise;
      expect(starts).toEqual([0, 1]);
      gates[1]!.resolve();
      await started[2]!.promise;
      expect(starts).toEqual([0, 1, 2]);
      gates[2]!.resolve();
      await started[3]!.promise;
      gates[0]!.resolve();
      await started[4]!.promise;
      gates[4]!.resolve();
      gates[3]!.resolve();
      expect(await result).toEqual([0, 1, 2, 3, 4]);
      expect(maxActive).toBe(2);
      expect(active).toBe(0);
    },
  );

  it.each(kinds)(
    "%s records one result, replays without execution, and detects cap drift",
    async (kind) => {
      const entries = new Map<number, JournalEntry>();
      let calls = 0;
      const make = () => {
        const runtime = createDurableRuntime({
          journal: new Map(entries),
          source: { now: () => 0, random: () => 0, uuid: () => "id" },
          writer: {
            append: (entry) => {
              entries.set(entry.seq, entry);
            },
            appendResolved: () => {},
            flush: async () => {},
            dispose: () => {},
          },
        });
        return createWorkflowPrimitives({ ...deps, ...runtime });
      };
      const run = (concurrency?: number) => {
        const primitives = make();
        const thunk = async () => ++calls;
        const options = concurrency === undefined ? {} : { concurrency };
        return kind === "parallel"
          ? primitives.parallel([thunk, thunk], options)
          : primitives.pipeline([0, 1], thunk, options);
      };
      expect(await run(1)).toEqual([1, 2]);
      expect(entries.size).toBe(1);
      expect(await run(1)).toEqual([1, 2]);
      expect(calls).toBe(2);
      await expect(run(2)).rejects.toThrow(/drift/i);
      await expect(run()).rejects.toThrow(/drift/i);
      expect(calls).toBe(2);
    },
  );

  it("handles empty inputs and an options-only pipeline", async () => {
    const primitives = createWorkflowPrimitives(deps);
    expect(await primitives.parallel([], { concurrency: 1 })).toEqual([]);
    expect(await primitives.pipeline([], { concurrency: 1 })).toEqual([]);
    expect(await primitives.pipeline([1, 2], { concurrency: 1 })).toEqual([1, 2]);
  });

  it("validates the cap before any branch runs", () => {
    const primitives = createWorkflowPrimitives(deps);
    for (const concurrency of [0, -1, 1.5, Infinity, NaN]) {
      expect(() => primitives.parallel([], { concurrency })).toThrow("positive finite integer");
      expect(() => primitives.pipeline([], { concurrency })).toThrow("positive finite integer");
    }
  });

  it("keeps failure reports and stops queued work on suspension", async () => {
    const failures: unknown[] = [];
    const primitives = createWorkflowPrimitives({
      ...deps,
      onCompositionBranchFailed: (f) => {
        failures.push(f);
      },
    });
    expect(
      await primitives.parallel(
        [
          async () => {
            throw new Error("no");
          },
          async () => "ok",
        ],
        { concurrency: 1 },
      ),
    ).toEqual([null, "ok"]);
    expect(
      await primitives.pipeline(
        [0, 1],
        async (_prev, _item, index) => {
          if (index === 0) throw new Error("no");
          return "ok";
        },
        { concurrency: 1 },
      ),
    ).toEqual([null, "ok"]);
    expect(failures).toHaveLength(2);
    for (const kind of ["parallel", "pipeline"] as const) {
      const suspended = new WorkflowSuspended("ask-1");
      const starts: number[] = [];
      const branch = async (index: number) => {
        starts.push(index);
        throw suspended;
      };
      const run =
        kind === "parallel"
          ? primitives.parallel([() => branch(0), () => branch(1)], { concurrency: 1 })
          : primitives.pipeline([0, 1], async (_prev, _item, index) => branch(index), {
              concurrency: 1,
            });
      await expect(run).rejects.toBe(suspended);
      expect(starts).toEqual([0]);
    }
    expect(failures).toHaveLength(2);
  });
});
