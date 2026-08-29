/**
 * Regression suite for the swallowed-suspension hazard.
 *
 * Suspension is signalled by throwing `WorkflowSuspended` through the workflow body, and there is
 * no uncatchable throw in JavaScript — so an ordinary defensive `try { await agent(…) } catch`
 * absorbed it and the run COMPLETED, status `completed`, carrying the catch branch's fallback for
 * a question nobody had answered. Silent, plausible, and exactly the shape a durable-execution
 * bug must never take. `parallel()`/`pipeline()`'s per-branch rejection handler had the same
 * defect one layer down.
 *
 * The fix is the sticky suspension latch (`SuspensionLatch`, `@runbook/core/handles`): catching
 * the signal is still possible, it is simply worthless. Each case below pins one half of that:
 *   1. swallow + return  — the run suspends instead of completing, and the RESUMED run takes the
 *                          try branch with the real reply (replay determinism holds).
 *   2. swallow in a loop — the re-throw lands before `takeSeq`, so exactly ONE ask ever fires.
 *   3. swallow inside parallel() — re-raised, and reported as unresumable rather than nulled.
 */

import { afterAll, describe, expect, it } from "vite-plus/test";

import { cleanupRunsRoot, runsRoot } from "./t3team-sdk.engineFixtures.ts";
import type * as SwallowWorkflow from "./__fixtures__/t3team-sdk.suspensionSwallow.workflow.ts";
import type * as SwallowLoopWorkflow from "./__fixtures__/t3team-sdk.suspensionSwallowLoop.workflow.ts";
import type * as SwallowParallelWorkflow from "./__fixtures__/t3team-sdk.suspensionSwallowParallel.workflow.ts";
import type * as SwallowSubWorkflow from "./__fixtures__/t3team-sdk.suspensionSwallowSub.workflow.ts";
import {
  appendResolvedEntry,
  createMockBroker,
  defineWorkflow,
  type MockBrokerOutcome,
  resumeWorkflow,
  startWorkflow,
  type SuspendedResult,
  type WorkflowRunResult,
} from "./t3team-sdk.index.ts";
import { journalFilePath } from "./t3team-sdk.journal.ts";
import { readJournalEntries } from "./t3team-sdk.journalReader.ts";

afterAll(cleanupRunsRoot);

const swallowWorkflow = defineWorkflow<typeof SwallowWorkflow>(
  "./__fixtures__/t3team-sdk.suspensionSwallow.workflow.ts",
);
const swallowLoopWorkflow = defineWorkflow<typeof SwallowLoopWorkflow>(
  "./__fixtures__/t3team-sdk.suspensionSwallowLoop.workflow.ts",
);
const swallowParallelWorkflow = defineWorkflow<typeof SwallowParallelWorkflow>(
  "./__fixtures__/t3team-sdk.suspensionSwallowParallel.workflow.ts",
);
const swallowSubWorkflow = defineWorkflow<typeof SwallowSubWorkflow>(
  "./__fixtures__/t3team-sdk.suspensionSwallowSub.workflow.ts",
);

type AnyResult<O> = WorkflowRunResult<O> | SuspendedResult;
const isSuspended = <O>(r: AnyResult<O>): r is SuspendedResult => "suspended" in r;

const alwaysDefer = (): MockBrokerOutcome => ({ kind: "defer" });

describe("durable workflow engine — a body cannot swallow its own suspension", () => {
  it("suspends (never completes) when a try/catch absorbs the signal, and resumes down the try branch", async () => {
    const broker = createMockBroker(alwaysDefer);
    const base = { runsRoot, tools: [], broker, launchThreadId: "launch-thread" } as const;

    const run = await startWorkflow(swallowWorkflow, {}, base);
    // Before the latch this was `{ satisfied: false, errorName: "WorkflowSuspended" }` on a
    // COMPLETED run. The catch branch's value must never reach the run's output.
    if (!isSuspended(run)) throw new Error(`expected a suspended run, got ${JSON.stringify(run)}`);
    expect(run.correlationId).toBe(`${run.runId}:1`);
    expect(broker.sent.map((envelope) => envelope.kind)).toEqual(["user.input"]);

    // Nothing was journaled after the swallow: one `sent`, no `resolved`, no stray primitive.
    const parked = readJournalEntries(journalFilePath(runsRoot, run.runId));
    expect(parked.bySeq.size).toBe(1);
    expect(parked.byCorrelation.size).toBe(0);

    expect(
      await appendResolvedEntry({
        runsRoot,
        runId: run.runId,
        correlationId: run.correlationId,
        reply: "approved",
      }),
    ).toBe(true);

    const resumed = await resumeWorkflow(run.runId, swallowWorkflow, {}, base);
    if (isSuspended(resumed)) throw new Error("expected the resumed run to complete");
    expect(resumed.result).toEqual({ satisfied: true, answer: "approved", errorName: "" });
    // The resume replayed the recorded ask instead of re-firing it.
    expect(broker.sent).toHaveLength(1);
  });

  it("fires exactly one ask when the body swallows the signal on every turn of a loop", async () => {
    const broker = createMockBroker(alwaysDefer);
    const run = await startWorkflow(
      swallowLoopWorkflow,
      {},
      {
        runsRoot,
        tools: [],
        broker,
        launchThreadId: "launch-thread",
      },
    );

    if (!isSuspended(run)) throw new Error(`expected a suspended run, got ${JSON.stringify(run)}`);
    expect(run.correlationId).toBe(`${run.runId}:1`);
    // The whole point: iterations 2 and 3 re-throw at `send`, before takeSeq — no second question
    // reaches the user, and no second `sent` entry has to line up on resume.
    expect(broker.sent).toHaveLength(1);
    expect(readJournalEntries(journalFilePath(runsRoot, run.runId)).bySeq.size).toBe(1);
  });

  it("suspends when a parent swallows a sub-workflow's suspension, and resumes into the child's answer", async () => {
    const broker = createMockBroker(alwaysDefer);
    const base = { runsRoot, tools: [], broker, launchThreadId: "launch-thread" } as const;

    const run = await startWorkflow(swallowSubWorkflow, { subject: "the release" }, base);
    // `workflow()` runs the child INLINE in this journal, so its suspension surfaces at the
    // parent's `await` — where a catch would otherwise substitute "assumed yes" for the answer.
    if (!isSuspended(run)) throw new Error(`expected a suspended run, got ${JSON.stringify(run)}`);
    expect(run.correlationId).toBe(`${run.runId}:1`);
    expect(broker.sent.map((envelope) => envelope.kind)).toEqual(["user.input"]);

    await appendResolvedEntry({
      runsRoot,
      runId: run.runId,
      correlationId: run.correlationId,
      reply: "approved",
    });
    const args = { subject: "the release" };
    const resumed = await resumeWorkflow(run.runId, swallowSubWorkflow, args, base);
    if (isSuspended(resumed)) throw new Error("expected the resumed run to complete");
    expect(resumed.result).toEqual({ answer: "approved", swallowed: false });
  });

  it("re-raises a suspension caught by parallel() instead of resolving the branch to null", async () => {
    const broker = createMockBroker(alwaysDefer);
    const run = startWorkflow(swallowParallelWorkflow, {}, { runsRoot, tools: [], broker });

    // Not `{ replies: [null, null] }`, and not a run parked on a correlationId no host can settle:
    // a named failure that says which composition cannot suspend and what to do instead.
    await expect(run).rejects.toThrow(/suspended inside parallel\(\)\/pipeline\(\)/);
  });
});
