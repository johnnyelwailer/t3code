import { describe, expect, it } from "vite-plus/test";

import { createWorkflowPrimitives, type WorkflowPrimitivesDeps } from "./composition.ts";
import { createDurableRuntime } from "./durableRuntime.ts";
import type { JournalEntry } from "./journalReader.ts";
import { WorkflowAborted } from "./errors.ts";
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

  it("rejects an invalid cap before any branch runs", async () => {
    const primitives = createWorkflowPrimitives(deps);
    for (const concurrency of [0, -1, 1.5, Infinity, NaN]) {
      await expect(primitives.parallel([], { concurrency })).rejects.toThrow(
        "positive finite integer",
      );
      await expect(primitives.pipeline([], { concurrency })).rejects.toThrow(
        "positive finite integer",
      );
    }
  });

  it("rejects non-object options, unknown keys and non-function stages instead of ignoring them", async () => {
    const primitives = createWorkflowPrimitives(deps);
    const ran: number[] = [];
    const thunk = async () => ran.push(1);
    await expect(primitives.parallel([thunk], 3 as never)).rejects.toThrow(TypeError);
    await expect(primitives.parallel([thunk], [] as never)).rejects.toThrow(/must be an object/);
    await expect(primitives.parallel([thunk], { concurency: 2 } as never)).rejects.toThrow(
      /Unknown composition option 'concurency'/,
    );
    // Typos in the pipeline options bag must not run unbounded, nor be treated as a no-op stage.
    await expect(primitives.pipeline([1], { concurency: 2 } as never)).rejects.toThrow(
      /Unknown composition option/,
    );
    await expect(primitives.pipeline([1], { x: 1 } as never)).rejects.toThrow(TypeError);
    await expect(primitives.pipeline([1], thunk, 3 as never)).rejects.toThrow(/stages must be/);
    await expect(primitives.pipeline([1], thunk, [] as never)).rejects.toThrow(/stages must be/);
    expect(ran).toEqual([]);
  });

  it.each(kinds)("%s stops launching queued branches once the run is aborted", async (kind) => {
    const controller = new AbortController();
    const primitives = createWorkflowPrimitives({ ...deps, abortSignal: controller.signal });
    const starts: number[] = [];
    const branch = async (index: number) => {
      starts.push(index);
      if (index === 0) controller.abort();
      return index;
    };
    const run =
      kind === "parallel"
        ? primitives.parallel(
            [0, 1, 2, 3].map((i) => () => branch(i)),
            { concurrency: 1 },
          )
        : primitives.pipeline([0, 1, 2, 3], async (_prev, _item, index) => branch(index), {
            concurrency: 1,
          });
    await expect(run).rejects.toBeInstanceOf(WorkflowAborted);
    expect(starts).toEqual([0]);
  });

  it("does not swallow an abort raised inside a branch as a null result", async () => {
    const primitives = createWorkflowPrimitives(deps);
    await expect(
      primitives.parallel([
        async () => {
          throw new WorkflowAborted();
        },
      ]),
    ).rejects.toBeInstanceOf(WorkflowAborted);
  });

  it.each(kinds)("%s snapshots its inputs at call time", async (kind) => {
    const primitives = createWorkflowPrimitives(deps);
    const gate = Promise.withResolvers<void>();
    const thunks: Array<() => Promise<number>> = [
      async () => {
        await gate.promise;
        return 0;
      },
      async () => 1,
    ];
    const items = [0, 1];
    const run =
      kind === "parallel"
        ? primitives.parallel(thunks, { concurrency: 1 })
        : primitives.pipeline(items, async (_prev, item) => item, { concurrency: 1 });
    thunks[1] = async () => 99;
    items[1] = 99;
    thunks.push(async () => 100);
    items.push(100);
    gate.resolve();
    expect(await run).toEqual([0, 1]);
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
