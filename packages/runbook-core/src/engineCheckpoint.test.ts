// @effect-diagnostics nodeBuiltinImport:off - this test drives the real engine + fs journal on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { inspectRun } from "./status.ts";
import { createCheckpointPrimitives } from "./checkpoint.ts";
import { createDurableRuntime } from "./durableRuntime.ts";
import { createWorkflowEngine } from "./engine.ts";
import { FsJournalStore } from "./journalStore.ts";
import type { ExecuteBodyRequest } from "./runEngine.ts";
import type { WorkflowRunOptionsBase } from "./engineTypes.ts";

const SOURCE = { now: () => 1_700_000_000_000, random: () => 0.5, uuid: () => "uuid-engine" };
const NOW_ISO = "2026-09-01T00:00:00.000Z";
const CRASH = Symbol("simulated host crash");
type LoopArgs = { readonly k: number; readonly crashAfter?: number; readonly history?: number };

/**
 * The crash-resume scenario end to end on the REAL engine + filesystem journal:
 * a loop body that runs an agent step + a checkpoint each iteration; the agent step "crashes"
 * the host part-way (the run settles `failed` with its journal intact); a `resumeWorkflow`
 * re-drives the SAME run through the checkpoint-aware window and must not re-fire the
 * journaled agent steps.
 */
describe("@runbook/core engine checkpoint resume", () => {
  const makeEngine = (counters: {
    readonly agentExecs: number[];
    readonly materializedBySeq: number[];
  }) =>
    createWorkflowEngine<{ readonly path: string }, WorkflowRunOptionsBase>({
      workflowPath: (ref) => ref.path,
      defaultRunsRoot: () => "unused",
      createStore: (runsRoot) => new FsJournalStore(runsRoot),
      newRunId: () => "run-ck-1",
      nowIso: () => NOW_ISO,
      executeBody: async (
        req: ExecuteBodyRequest<{ path: string }, WorkflowRunOptionsBase>,
      ): Promise<unknown> => {
        counters.materializedBySeq.push(req.journal.bySeq.size);
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
          // Core seam injection: the SDK-level crash/resume test covers runner wiring end to end.
          ...(req.resume === undefined ? {} : { resumeFrom: req.resume.checkpoint }),
        });
        let state =
          req.resume === undefined
            ? { i: 0, total: 0 }
            : (req.resume.checkpoint.state as { i: number; total: number });
        const { k, crashAfter, history } = req.args as LoopArgs;
        const runAgent = async (i: number): Promise<number> =>
          await runtime.callPrimitive({
            kind: "agent.step",
            refId: "agent",
            args: { prompt: `step-${i}` },
            exec: async () => {
              counters.agentExecs.push(i);
              return i + 1;
            },
          });
        for (let i = state.i; i < k; i++) {
          const result = await runAgent(i);
          // Simulated hard crash AFTER the agent step's journaled result, BEFORE its checkpoint.
          if (req.resume === undefined && crashAfter === i) throw CRASH;
          state = { i: i + 1, total: state.total + result };
          await checkpoint(history === undefined ? { state } : { state, retention: { history } });
        }
        return state;
      },
    });

  it("resume continues from the checkpoint with bounded materialization and zero re-fires", async () => {
    const K = 30;
    const CRASH_AT = 17;
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-ck-"));
    const counters = { agentExecs: [] as number[], materializedBySeq: [] as number[] };
    const engine = makeEngine(counters);
    const ref = { path: "bounded-loop.workflow.ts" };

    // First drive: the host crashes on agent step 17 (its result is journaled, the checkpoint is not).
    await expect(
      engine.startWorkflow(ref, { k: K, crashAfter: CRASH_AT }, { runId: "run-ck-1", runsRoot }),
    ).rejects.toBe(CRASH);

    const store = new FsJournalStore(runsRoot);
    const afterCrash = await store.readEntries("run-ck-1");
    // Agents i=0..CRASH_AT run (the CRASH_AT-th is in-flight), checkpoints committed for i=0..CRASH_AT-1.
    expect(afterCrash.bySeq.size).toBe(2 * CRASH_AT + 1);
    expect(counters.agentExecs).toEqual(Array.from({ length: CRASH_AT + 1 }, (_, n) => n));

    // Resume the SAME run (identical args: the run-input hash is checked at seq 0):
    // the engine reads the checkpoint window, not the full journal.
    const second = await engine.resumeWorkflow(
      "run-ck-1",
      ref,
      { k: K, crashAfter: CRASH_AT },
      {
        runsRoot,
      },
    );
    expect(second).toEqual({
      runId: "run-ck-1",
      result: { i: K, total: sum(1, K) },
    });

    // (a) no re-fire of journaled agent steps: across BOTH drives every agent step executes live
    // exactly once, in order 0..K-1. Step CRASH_AT ran live on the first drive (the crash fires
    // after its execution), then REPLAYS on the resume drive instead of re-firing.
    expect(counters.agentExecs).toEqual(Array.from({ length: K }, (_, n) => n));
    // (b) the resume drive materialized the BOUNDED window: one entry (the in-flight agent).
    expect(counters.materializedBySeq).toEqual([0, 1]);
    // (c) inspectRun exposes the active boundary and the bounded materialization.
    const status = await inspectRun(store, "run-ck-1");
    expect(status.entryCount).toBe(2 * K);
    expect(status.materializedEntryCount).toBe(0);
    expect(status.checkpointSeq).toBe(2 * K);
    expect(status.checkpoint?.state).toEqual({ i: K, total: sum(1, K) });
  }, 60_000);

  it("inspectRun exposes a real run's history(n) ring across a crash-resume", async () => {
    const K = 10;
    const CRASH_AT = 6;
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-ck-history-"));
    const engine = makeEngine({ agentExecs: [], materializedBySeq: [] });
    const ref = { path: "bounded-loop.workflow.ts" };
    const args = { k: K, crashAfter: CRASH_AT, history: 6 };

    await expect(engine.startWorkflow(ref, args, { runId: "run-ck-1", runsRoot })).rejects.toBe(
      CRASH,
    );
    const store = new FsJournalStore(runsRoot);
    // Drive 1 committed checkpoints at seqs 2,4,..,12 (states i=1..6) before crashing on agent
    // step 6 (seq 13). The boundary is seq 12; its recorded ring holds all six.
    const midRun = await inspectRun(store, "run-ck-1");
    expect(midRun.checkpointSeq).toBe(2 * CRASH_AT);
    expect(midRun.history?.map((h) => h.seq)).toEqual([2, 4, 6, 8, 10, 12]);

    await engine.resumeWorkflow("run-ck-1", ref, args, { runsRoot });
    const status = await inspectRun(store, "run-ck-1");
    // Drive 2 commits seqs 14..20 (states i=7..10). A 6-slot ring ending at seq 20 MUST reach
    // back across the resume to drive 1's seqs 10 and 12 — a post-resume-only view holds 4.
    expect(status.entryCount).toBe(2 * K);
    expect(status.history?.map((h) => h.seq)).toEqual([10, 12, 14, 16, 18, 20]);
    expect(status.history?.map((h) => h.state)).toEqual(
      Array.from({ length: 6 }, (_, n) => ({ i: n + 5, total: sum(1, n + 5) })),
    );
    // Read from the active record alone: the ring is recorded, not rescanned.
    expect(status.checkpoint?.history).toEqual(status.history);
    expect(status.history?.at(-1)?.state).toEqual(status.checkpoint?.state);
  }, 60_000);
});

function sum(from: number, through: number): number {
  let total = 0;
  for (let n = from; n <= through; n++) total += n;
  return total;
}
