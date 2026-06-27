/**
 * End-to-end Thread-model test (Epic 25 acceptance). One recipe body runs an isolated-thread
 * `agent(..., { schema })`, a launching-thread `thread.askAgent(..., { schema })`, and a
 * launching-thread `thread.askUser(..., { schema })`. A broker that always defers makes each
 * ask suspend; the test then plays the production reactor's role — `appendResolvedEntry` +
 * `resumeWorkflow` for each pending correlationId in turn — until the run completes with all
 * three replies validated against their schemas.
 *
 * This is the suspend→resume loop the real `WorkflowEngineReactor` drives off `turn-done` /
 * user-reply events; here the replies are canned so the whole pipeline is deterministic.
 */

import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  cleanupRunsRoot,
  e2eReviewWorkflow,
  resetCounters,
  runsRoot,
} from "./t3work-sdk.engineFixtures.ts";
import {
  appendResolvedEntry,
  createMockBroker,
  resumeWorkflow,
  startWorkflow,
  type SuspendedResult,
  type WorkflowRunResult,
} from "./t3work-sdk.index.ts";
import { journalFilePath } from "./t3work-sdk.journal.ts";
import { readJournalEntries } from "./t3work-sdk.journalReader.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

const isSuspended = <O>(r: WorkflowRunResult<O> | SuspendedResult): r is SuspendedResult =>
  "suspended" in r;

describe("durable workflow engine — end-to-end Thread model", () => {
  it("drives agent(schema) + thread.askAgent + thread.askUser through suspend→resume to completion", async () => {
    const broker = createMockBroker(() => ({ kind: "defer" })); // every ask parks the run
    const base = { runsRoot, tools: [], broker, launchThreadId: "launch-thread" } as const;

    // Replies the "reactor" feeds back, in the order the body asks for them. Objects mimic an
    // agent/user reply the SDK parses + validates against the call's schema.
    const replies = [
      JSON.stringify({ risk: "high" }), // agent(schema) — isolated-thread turn
      JSON.stringify({ plan: "Ship behind a flag, ramp 1% → 100%." }), // thread.askAgent
      JSON.stringify({ approved: true }), // thread.askUser
    ];

    let result: WorkflowRunResult<unknown> | SuspendedResult = await startWorkflow(
      e2eReviewWorkflow,
      { change: "rewrite the billing path" },
      base,
    );

    const seenCorrelations: string[] = [];
    let i = 0;
    while (isSuspended(result)) {
      expect(i).toBeLessThan(replies.length); // never suspend more times than we have replies
      seenCorrelations.push(result.correlationId);
      const wrote = await appendResolvedEntry({
        runsRoot,
        runId: result.runId,
        correlationId: result.correlationId,
        reply: replies[i],
      });
      expect(wrote).toBe(true);
      i += 1;
      result = await resumeWorkflow(
        result.runId,
        e2eReviewWorkflow,
        { change: "rewrite the billing path" },
        base,
      );
    }

    expect(result.result).toEqual({
      risk: "high",
      plan: "Ship behind a flag, ramp 1% → 100%.",
      approved: true,
    });
    // Three asks → three distinct suspensions, each resolved once.
    expect(i).toBe(3);
    expect(new Set(seenCorrelations).size).toBe(3);

    // The journal records every fired verb's sent entry plus the three resolved replies.
    const { bySeq, byCorrelation } = readJournalEntries(journalFilePath(runsRoot, result.runId));
    const kinds = [...bySeq.values()].sort((a, b) => a.seq - b.seq).map((e) => e.kind);
    // agent() = thread.create + thread.turn; askAgent = thread.turn; askUser = user.input.
    expect(kinds).toEqual(["thread.create", "thread.turn", "thread.turn", "user.input"]);
    expect(byCorrelation.size).toBe(3);

    // Replaying the completed run re-derives the same result without re-firing the broker.
    const broker2Sent = broker.sent.length;
    const replayed = await resumeWorkflow(
      result.runId,
      e2eReviewWorkflow,
      { change: "rewrite the billing path" },
      base,
    );
    if (isSuspended(replayed)) throw new Error("a completed run must not re-suspend on replay");
    expect(replayed.result).toEqual(result.result);
    expect(broker.sent.length).toBe(broker2Sent); // no re-fire
  });
});
