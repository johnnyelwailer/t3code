import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as Schema from "effect/Schema";
import { selectReplayWindow } from "@runbook/core/checkpoint";
import { afterAll, describe, expect, it } from "vite-plus/test";

import type * as Poller from "./__fixtures__/t3team-sdk.accumulatePoller.workflow.ts";
import type * as GuardParent from "./__fixtures__/t3team-sdk.subAccumulateGuardParent.workflow.ts";
import {
  FsJournalStore,
  SubWorkflowCheckpointError,
  defineTool,
  defineToolGroup,
  defineWorkflow,
  resumeWorkflow,
  startWorkflow,
} from "./t3team-sdk.index.ts";

/**
 * `accumulate` end to end through a REAL `.workflow.ts` body on the SDK surface: the imported
 * `accumulate`/`reducerState` resolve from the run, every fold commits a checkpoint boundary, and a
 * crash-resume through the checkpoint-aware window folds to exactly what an uninterrupted run folds.
 */
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-accumulate-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const K = 12;
const readingAt = (i: number): number => (i * 7) % 11;
const probe = { crashAt: undefined as number | undefined, observeExecs: [] as number[] };

const reduceDemo = defineToolGroup({
  id: "reduceDemo.read",
  label: "Reduce demo tools",
  description: "Tools used by the accumulate end-to-end test.",
});
const observeTool = defineTool({
  id: "reduceDemo.observe",
  group: reduceDemo,
  args: Schema.Struct({ i: Schema.Number }),
  result: Schema.Struct({ reading: Schema.Number }),
  handler: async ({ i }) => {
    probe.observeExecs.push(i);
    return { reading: readingAt(i) };
  },
});
// Throws while armed: the host "crashes" AFTER the reading is journaled, BEFORE its fold commits.
const probeTool = defineTool({
  id: "reduceDemo.probe",
  group: reduceDemo,
  args: Schema.Struct({ i: Schema.Number }),
  result: Schema.Void,
  handler: async ({ i }) => {
    if (probe.crashAt === i) throw new Error(`simulated host crash at reading ${i}`);
  },
});
const tools = [observeTool, probeTool];

const poller = defineWorkflow<typeof Poller>(
  "./__fixtures__/t3team-sdk.accumulatePoller.workflow.ts",
);
const guardParent = defineWorkflow<typeof GuardParent>(
  "./__fixtures__/t3team-sdk.subAccumulateGuardParent.workflow.ts",
);

describe("accumulate through a real workflow body", () => {
  it("crash between reading and fold commit, then resume, folds the same state as an uninterrupted run", async () => {
    probe.crashAt = undefined;
    const straight = await startWorkflow(
      poller,
      { k: K },
      { runsRoot, tools, runId: "run-acc-straight" },
    );
    expect(straight.result).toEqual({
      current: {
        n: K,
        total: Array.from({ length: K }, (_, i) => readingAt(i)).reduce((a, b) => a + b, 0),
        max: Math.max(...Array.from({ length: K }, (_, i) => readingAt(i))),
      },
      ring: [K - 3, K - 2, K - 1].map(readingAt),
    });

    probe.observeExecs = [];
    probe.crashAt = 5;
    const crashed = await startWorkflow(
      poller,
      { k: K },
      { runsRoot, tools, runId: "run-acc-crash" },
    ).catch((thrown: unknown) => thrown);
    expect(crashed).toBeInstanceOf(Error);

    // Reading 5 is journaled; its fold is not — the active boundary is the fold of reading 4.
    const store = new FsJournalStore(runsRoot);
    const afterCrash = selectReplayWindow(await store.readEntries("run-acc-crash"));
    expect(afterCrash.checkpoint?.record.state).toMatchObject({
      primitive: "reduce",
      reducerId: "metrics",
      reducers: { metrics: { current: { n: 5 }, ring: [2, 3, 4].map(readingAt) } },
    });

    probe.crashAt = undefined;
    const resumed = await resumeWorkflow("run-acc-crash", poller, { k: K }, { runsRoot, tools });
    expect(resumed.result).toEqual(straight.result);
    // The journaled reading 5 replays from the retained suffix instead of re-firing.
    expect(probe.observeExecs).toEqual(Array.from({ length: K }, (_, n) => n));

    const final = selectReplayWindow(await store.readEntries("run-acc-crash"));
    expect(final.checkpoint?.record.state).toMatchObject({
      reducers: { metrics: straight.result },
    });
    expect(final.materializedEntries).toBe(0);
  });

  it("refuses accumulate() in a sub-workflow body with a named error, before journaling any boundary", async () => {
    const error = await startWorkflow(
      guardParent,
      {},
      { runsRoot, tools: [], runId: "run-acc-sub-guard" },
    ).catch((thrown: unknown) => thrown);

    expect(error, "the run must reject").toBeInstanceOf(SubWorkflowCheckpointError);
    expect((error as Error).message).toMatch(/^accumulate\(\) is not valid inside a sub-workflow/);

    const entries = await new FsJournalStore(runsRoot).readEntries("run-acc-sub-guard");
    const checkpointEntries = [...entries.bySeq.values()].filter(
      (entry) => entry.kind === "checkpoint",
    );
    expect(checkpointEntries, "no boundary may be journaled").toHaveLength(0);
  });
});
