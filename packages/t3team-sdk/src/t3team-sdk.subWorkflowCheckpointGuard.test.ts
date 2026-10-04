import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";

import type * as GuardParent from "./__fixtures__/t3team-sdk.subCheckpointGuardParent.workflow.ts";
import type * as TopLevel from "./__fixtures__/t3team-sdk.subCheckpointTopLevel.workflow.ts";
import { demoScripts } from "./t3team-sdk.engineFixtures.ts";
import {
  FsJournalStore,
  SubWorkflowCheckpointError,
  defineWorkflow,
  startWorkflow,
} from "./t3team-sdk.index.ts";

/**
 * Bounded-execution guard: `checkpoint()` inside a SUB-workflow body must be refused. A child
 * journals into the same run sequence as its parent and shares the run's checkpoint primitive,
 * so a boundary committed there would move the run's shared replay window — a crash
 * mid-sub-workflow would re-drive the TOP-level body from the child's boundary, no longer at its
 * journaled seqs, and the pre-loop setup + child prefix would re-fire live or fail drift.
 * The guard throws a named error before any boundary is journaled; the top-level body keeps the
 * real primitive unchanged.
 */
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-sub-cp-guard-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const guardParent = defineWorkflow<typeof GuardParent>(
  "./__fixtures__/t3team-sdk.subCheckpointGuardParent.workflow.ts",
);
const topLevel = defineWorkflow<typeof TopLevel>(
  "./__fixtures__/t3team-sdk.subCheckpointTopLevel.workflow.ts",
);

describe("sub-workflow checkpoint guard", () => {
  it("refuses checkpoint() in a sub-workflow body with a named error, before journaling any boundary", async () => {
    const error = await startWorkflow(
      guardParent,
      {},
      {
        runsRoot,
        tools: [],
        runId: "run-ck-sub-guard",
      },
    ).catch((thrown: unknown) => thrown);

    expect(error, "the run must reject").toBeInstanceOf(SubWorkflowCheckpointError);
    expect((error as Error).name).toBe("SubWorkflowCheckpointError");
    expect((error as Error).message).toMatch(
      /checkpoints are only valid in the top-level run body/i,
    );

    // The refusal happens at the call site: no checkpoint entry reached the journal.
    const entries = await new FsJournalStore(runsRoot).readEntries("run-ck-sub-guard");
    const checkpointEntries = [...entries.bySeq.values()].filter(
      (entry) => entry.kind === "checkpoint",
    );
    expect(checkpointEntries, "no boundary may be journaled").toHaveLength(0);
  });

  it("still commits a top-level checkpoint unchanged when sub-workflow composition is present", async () => {
    const result = await startWorkflow(
      topLevel,
      { name: "eins" },
      {
        runsRoot,
        tools: [],
        scripts: demoScripts,
        runId: "run-ck-sub-top",
      },
    );

    // The top-level boundary is journaled at its own seq (seq 1: the checkpoint precedes the
    // sub-workflow's journal entries), and the sub-workflow result still flows back.
    expect(result).toMatchObject({
      result: { compactedThroughSeq: 0, greeting: "hi eins" },
    });
    const entries = await new FsJournalStore(runsRoot).readEntries("run-ck-sub-top");
    const checkpointEntries = [...entries.bySeq.values()].filter(
      (entry) => entry.kind === "checkpoint",
    );
    expect(checkpointEntries).toHaveLength(1);
    expect(checkpointEntries[0].seq).toBe(1);
  });
});
