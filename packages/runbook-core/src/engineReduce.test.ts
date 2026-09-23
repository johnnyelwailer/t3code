// @effect-diagnostics nodeBuiltinImport:off - this test drives the real engine + fs journal on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { inspectRun } from "./status.ts";
import { createCheckpointPrimitives } from "./checkpoint.ts";
import { createReducePrimitives } from "./reduce.ts";
import { createDurableRuntime } from "./durableRuntime.ts";
import { createWorkflowEngine } from "./engine.ts";
import { FsJournalStore } from "./journalStore.ts";
import type { ExecuteBodyRequest } from "./runEngine.ts";
import type { WorkflowRunOptionsBase } from "./engineTypes.ts";

const SOURCE = { now: () => 1_700_000_000_000, random: () => 0.5, uuid: () => "uuid-engine" };
const NOW_ISO = "2026-09-01T00:00:00.000Z";
const CRASH = Symbol("simulated host crash");
const RING = 3;
type LoopArgs = { readonly k: number; readonly crashAfter?: number };
type Metrics = { readonly n: number; readonly total: number; readonly max: number };

/** The external data source a poller observes: deterministic, so two runs see the same stream. */
const observationAt = (i: number): number => (i * 7) % 11;
const foldMetrics = (current: Metrics | undefined, observation: number): Metrics => ({
  n: (current?.n ?? 0) + 1,
  total: (current?.total ?? 0) + observation,
  max: Math.max(current?.max ?? observation, observation),
});

/**
 * The accumulate crash-resume scenario end to end on the REAL engine + filesystem journal:
 * each iteration observes (a journaled step) and folds the observation into a reducer (a
 * checkpoint boundary). The host "crashes" BETWEEN an observation and its fold commit; a
 * `resumeWorkflow` re-drives the SAME run through the checkpoint-aware window, restores the
 * reducer from its boundary, and must fold to exactly what an uninterrupted run folds.
 */
describe("@runbook/core engine accumulate resume", () => {
  const makeEngine = (runId: string, counters: { readonly observeExecs: number[] }) => {
    let drives = 0;
    return createWorkflowEngine<{ readonly path: string }, WorkflowRunOptionsBase>({
      workflowPath: (ref) => ref.path,
      defaultRunsRoot: () => "unused",
      createStore: (runsRoot) => new FsJournalStore(runsRoot),
      newRunId: () => runId,
      nowIso: () => NOW_ISO,
      executeBody: async (
        req: ExecuteBodyRequest<{ path: string }, WorkflowRunOptionsBase>,
      ): Promise<unknown> => {
        const drive = ++drives;
        const runtime = createDurableRuntime({
          journal: req.journal.bySeq,
          writer: req.sink,
          source: SOURCE,
          nowIso: () => NOW_ISO,
          ...(req.resume === undefined ? {} : { initialSeq: req.resume.fromSeq }),
        });
        const { checkpoint } = createCheckpointPrimitives({
          callPrimitive: runtime.callPrimitive,
          currentSeq: runtime.currentSeq,
          nowIso: () => NOW_ISO,
        });
        const { accumulate, reducerState } = createReducePrimitives({
          checkpoint,
          resume: req.resume?.checkpoint,
        });
        const { k, crashAfter } = req.args as LoopArgs;
        const observe = async (i: number): Promise<number> =>
          await runtime.callPrimitive({
            kind: "tool",
            refId: "observe",
            args: { i },
            exec: async () => {
              counters.observeExecs.push(i);
              return observationAt(i);
            },
          });
        // The reducer's own state is the loop cursor: a resume continues from the recorded fold.
        for (let i = reducerState<Metrics>("metrics")?.current.n ?? 0; i < k; i++) {
          const observation = await observe(i);
          // Simulated hard crash AFTER the observation is journaled, BEFORE its fold commits.
          if (drive === 1 && crashAfter === i) throw CRASH;
          await accumulate("metrics", foldMetrics, observation, { retention: { ring: RING } });
        }
        return reducerState<Metrics, number>("metrics");
      },
    });
  };

  const K = 20;
  const ref = { path: "bounded-poller.workflow.ts" };

  const uninterrupted = async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-reduce-"));
    const engine = makeEngine("run-reduce-straight", { observeExecs: [] });
    const run = await engine.startWorkflow(
      ref,
      { k: K },
      { runId: "run-reduce-straight", runsRoot },
    );
    if (!("result" in run)) throw new Error("the uninterrupted run did not complete");
    return run;
  };

  it.each([0, 7, K - 1])(
    "crash after observation %i, then resume, folds the same state as an uninterrupted run",
    async (crashAt) => {
      const expected = await uninterrupted();
      expect(expected.result).toEqual({
        current: Array.from({ length: K }, (_, i) => observationAt(i)).reduce(
          (current: Metrics | undefined, o) => foldMetrics(current, o),
          undefined,
        ),
        ring: [K - 3, K - 2, K - 1].map(observationAt),
      });

      const runId = `run-reduce-crash-${crashAt}`;
      const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-reduce-"));
      const counters = { observeExecs: [] as number[] };
      const engine = makeEngine(runId, counters);
      const args = { k: K, crashAfter: crashAt };

      await expect(engine.startWorkflow(ref, args, { runId, runsRoot })).rejects.toBe(CRASH);
      const store = new FsJournalStore(runsRoot);
      // Observations 0..crashAt are journaled; folds committed only for 0..crashAt-1.
      expect((await store.readEntries(runId)).bySeq.size).toBe(2 * crashAt + 1);

      const resumed = await engine.resumeWorkflow(runId, ref, args, { runsRoot });
      expect(resumed).toEqual({ runId, result: expected.result });

      // No observation re-fires: the in-flight one replays from the retained suffix.
      expect(counters.observeExecs).toEqual(Array.from({ length: K }, (_, n) => n));
      const status = await inspectRun(store, runId);
      expect(status.checkpointSeq).toBe(2 * K);
      expect(status.materializedEntryCount).toBe(0);
      expect(status.checkpoint?.state).toMatchObject({
        primitive: "reduce",
        reducerId: "metrics",
        reducers: { metrics: expected.result },
      });
    },
    60_000,
  );
});
